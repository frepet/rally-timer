import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { findMissingStarts } from '../../../lib/domain/missingStarts';
import { dnfPenaltyMs } from '../../../lib/domain/dnfPenalties';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	// Load all current start events
	const existingStarts = await sql`
		SELECT driver_id, stage_id FROM start_events
	`;

	const startPairs = existingStarts.map((r) => ({
		driver_id: r.driver_id as number,
		stage_id: r.stage_id as number
	}));

	const missing = findMissingStarts(startPairs);
	if (missing.length === 0) {
		return json({ startsAdded: 0, dnfsAdded: 0 });
	}

	const now = Date.now();

	// Insert missing start events (one per missing pair, using current time as ts_ms).
	// Elapsed time is always finish_ts - start_ts = penalty, so the absolute start
	// timestamp does not affect the computed elapsed time for the synthetic DNF finish.
	await sql`
		INSERT INTO start_events (stage_id, driver_id, ts_ms)
		SELECT * FROM ${sql(
			missing.map((m) => ({ stage_id: m.stage_id, driver_id: m.driver_id, ts_ms: now }))
		)}
	`;

	// Apply DNF finish events for the newly-added starters on each affected stage.
	const affectedStageIds = [...new Set(missing.map((m) => m.stage_id))];
	let dnfsAdded = 0;

	for (const stageId of affectedStageIds) {
		// Load all starters for this stage with driver info
		const starters = await sql`
			SELECT se.driver_id, se.ts_ms, d.tag, d.class_id
			FROM start_events se
			JOIN drivers d ON d.id = se.driver_id
			WHERE se.stage_id = ${stageId}
		`;

		// Find the latest start per driver
		type DriverInfo = { latestStart: number; tag: string; classId: number };
		const driverMap = new Map<number, DriverInfo>();
		for (const se of starters) {
			const ts = Number(se.ts_ms);
			const existing = driverMap.get(se.driver_id as number);
			if (!existing || ts > existing.latestStart) {
				driverMap.set(se.driver_id as number, {
					latestStart: ts,
					tag: se.tag as string,
					classId: se.class_id as number
				});
			}
		}

		// Load real (non-DNF) finish events for this stage
		const rawFinishes = await sql`
			SELECT timestamp, tag FROM finish_events
			WHERE stage_id = ${stageId} AND dnf = false
		`;
		const finishes = rawFinishes.map((fe) => ({
			timestamp: Number(fe.timestamp),
			tag: fe.tag as string
		}));

		// Compute slowest elapsed per class from real finishers
		const classSlowests = new Map<number, number>();
		for (const [, info] of driverMap) {
			const validFinish = finishes
				.filter((fe) => fe.tag === info.tag && fe.timestamp >= info.latestStart)
				.sort((a, b) => a.timestamp - b.timestamp)[0];
			if (validFinish) {
				const elapsed = validFinish.timestamp - info.latestStart;
				const cur = classSlowests.get(info.classId);
				if (cur === undefined || elapsed > cur) classSlowests.set(info.classId, elapsed);
			}
		}

		// Insert DNF finish events only for the newly-added starters (those in `missing`)
		const newDriverIdsForStage = new Set(
			missing.filter((m) => m.stage_id === stageId).map((m) => m.driver_id)
		);

		for (const [driverId, info] of driverMap) {
			if (!newDriverIdsForStage.has(driverId)) continue;

			// Skip if the driver already has any finish event (real or DNF)
			const alreadyFinished = finishes.some(
				(fe) => fe.tag === info.tag && fe.timestamp >= info.latestStart
			);
			if (alreadyFinished) continue;

			const finishTs = info.latestStart + dnfPenaltyMs(classSlowests.get(info.classId));

			const [inserted] = await sql`
				INSERT INTO finish_events (stage_id, timestamp, tag, dnf)
				VALUES (${stageId}, ${finishTs}, ${info.tag}, true)
				ON CONFLICT (stage_id, tag) WHERE dnf DO NOTHING
				RETURNING id
			`;
			if (inserted) dnfsAdded++;
		}
	}

	return json({ startsAdded: missing.length, dnfsAdded });
}
