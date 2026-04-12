import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

const DNF_PENALTY_MS = 30_000;
const DNF_FALLBACK_MS = 600_000;

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	const stageId = Number(event.params.id);
	if (!stageId) throw error(400, 'Invalid stage id');

	// Verify stage exists
	const [stage] = await sql`SELECT id FROM stages WHERE id = ${stageId}`;
	if (!stage) throw error(404, 'Stage not found');

	// Load all starts for this stage with driver info
	const starts = await sql`
		SELECT se.driver_id, se.ts_ms, d.tag, d.class_id, d.name AS driver_name
		FROM start_events se
		JOIN drivers d ON d.id = se.driver_id
		WHERE se.stage_id = ${stageId}
	`;

	if (starts.length === 0) {
		return json({ dnfCount: 0, gateMovedToStageId: null });
	}

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

		// Skip if a synthetic finish already exists for this driver+stage
		const [existing] = await sql`
			SELECT id FROM finish_events
			WHERE stage_id = ${stageId} AND tag = ${driverInfo.tag} AND dnf = true
		`;
		if (existing) continue;

		const slowest = classSlowests.get(driverInfo.classId);
		const penalty = slowest !== undefined ? slowest + DNF_PENALTY_MS : DNF_FALLBACK_MS;
		const finishTs = driverInfo.latestStart + penalty;

		await sql`
			INSERT INTO finish_events (stage_id, timestamp, tag, dnf)
			VALUES (${stageId}, ${finishTs}, ${driverInfo.tag}, true)
		`;
		dnfCount++;
	}

	// Unassign gate from this stage, capture freed gate IDs
	const freedGates = await sql`
		UPDATE gates SET stage_id = NULL WHERE stage_id = ${stageId} RETURNING id
	`;

	// Find the next stage (by insertion order)
	const [nextStage] = await sql`
		SELECT id FROM stages WHERE id > ${stageId} ORDER BY id LIMIT 1
	`;

	// Assign freed gate(s) to next stage if it has none assigned yet
	let gateMovedToStageId: number | null = null;
	if (nextStage && freedGates.length > 0) {
		const [alreadyAssigned] = await sql`
			SELECT id FROM gates WHERE stage_id = ${nextStage.id as number} LIMIT 1
		`;
		if (!alreadyAssigned) {
			for (const gate of freedGates) {
				await sql`UPDATE gates SET stage_id = ${nextStage.id as number} WHERE id = ${gate.id as string}`;
			}
			gateMovedToStageId = nextStage.id as number;
		}
	}

	return json({ dnfCount, gateMovedToStageId });
}
