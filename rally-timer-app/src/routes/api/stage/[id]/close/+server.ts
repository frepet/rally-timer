import { assertEventSelection } from '$lib/server/eventSelection';
import { assignGate, releaseGate } from '$lib/server/eventGates';
import { requireStageEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';
import { dnfPenaltyMs } from '../../../../../lib/domain/dnfPenalties';

export async function POST(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireStageEvent(Number(event.params.id), true, sql);
		assertEventSelection(event.url, appEvent.id);

		const stageId = Number(event.params.id);
		if (!stageId) throw error(400, 'Invalid stage id');

		// Verify stage exists and mark it closed
		const [stage] = await sql`SELECT id FROM stages WHERE id = ${stageId}`;
		if (!stage) throw error(404, 'Stage not found');
		await sql`UPDATE stages SET is_closed = true WHERE id = ${stageId}`;

		// Load all starts for this stage with driver info
		const starts = await sql`
		SELECT se.driver_id, se.ts_ms, d.tag, d.class_id, d.name AS driver_name
		FROM start_events se
		JOIN drivers d ON d.id = se.driver_id
		WHERE se.stage_id = ${stageId}
	`;

		// Load all real (non-synthetic) finish events for this stage
		const rawFinishes = await sql`
		SELECT timestamp, tag
		FROM finish_events
		WHERE stage_id = ${stageId} AND dnf = false
	`;
		const finishes = rawFinishes.map((fe) => ({
			timestamp: Number(fe.timestamp),
			tag: fe.tag as string
		}));

		// Build per-driver: latest start timestamp, tag, class_id
		type DriverInfo = { latestStart: number; tag: string; classId: number; name: string };
		const driverMap = new Map<number, DriverInfo>();
		for (const se of starts) {
			const ts = Number(se.ts_ms);
			const existing = driverMap.get(se.driver_id as number);
			if (!existing || ts > existing.latestStart) {
				driverMap.set(se.driver_id as number, {
					latestStart: ts,
					tag: se.tag as string,
					classId: se.class_id as number,
					name: se.driver_name as string
				});
			}
		}

		// Find slowest real finish per class
		const classSlowests = new Map<number, number>();
		for (const [, driverInfo] of driverMap) {
			const validFinish = finishes
				.filter((fe) => fe.tag === driverInfo.tag && fe.timestamp >= driverInfo.latestStart)
				.sort((a, b) => a.timestamp - b.timestamp)[0];

			if (validFinish) {
				const elapsed = validFinish.timestamp - driverInfo.latestStart;
				const cur = classSlowests.get(driverInfo.classId);
				if (cur === undefined || elapsed > cur) classSlowests.set(driverInfo.classId, elapsed);
			}
		}

		// Insert synthetic finish events for DNF drivers (idempotent)
		let dnfCount = 0;
		for (const [, driverInfo] of driverMap) {
			const validFinish = finishes
				.filter((fe) => fe.tag === driverInfo.tag && fe.timestamp >= driverInfo.latestStart)
				.sort((a, b) => a.timestamp - b.timestamp)[0];

			if (validFinish) continue; // already has a real finish

			const finishTs = driverInfo.latestStart + dnfPenaltyMs(classSlowests.get(driverInfo.classId));

			// ON CONFLICT makes this idempotent and race-safe: a concurrent close
			// inserting the same synthetic DNF is a no-op rather than a duplicate.
			const [inserted] = await sql`
			INSERT INTO finish_events (stage_id, timestamp, tag, dnf)
			VALUES (${stageId}, ${finishTs}, ${driverInfo.tag}, true)
			ON CONFLICT (stage_id, tag) WHERE dnf DO NOTHING
			RETURNING id
		`;
			if (inserted) dnfCount++;
		}

		// Unassign gate from this stage, capture freed gate IDs
		const freedGates = await sql`
		SELECT id FROM gates WHERE stage_id = ${stageId}
	`;

		for (const gate of freedGates) await releaseGate(sql, String(gate.id), appEvent.id);

		// Find the next stage (by insertion order)
		const [nextStage] = await sql`
		SELECT id FROM stages WHERE event_id = ${appEvent.id} AND is_closed = false AND id > ${stageId} ORDER BY id LIMIT 1
	`;

		// Assign freed gate(s) to next stage if it has none assigned yet
		let gateMovedToStageId: number | null = null;
		if (nextStage && freedGates.length > 0) {
			const [alreadyAssigned] = await sql`
			SELECT id FROM gates WHERE stage_id = ${nextStage.id as number} LIMIT 1
		`;
			if (!alreadyAssigned) {
				for (const gate of freedGates) {
					await assignGate(sql, String(gate.id), appEvent.id, Number(nextStage.id));
				}
				gateMovedToStageId = nextStage.id as number;
			}
		}

		return json({ dnfCount, gateMovedToStageId });
	});
}
