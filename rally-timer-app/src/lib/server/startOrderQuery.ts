import { sql } from './db';
import {
	computeStartOrder,
	type StartOrderDriver,
	type StartOrderEntry
} from '../domain/startOrder';
import { buildStageTimes } from '../domain/rallySubmission';

/**
 * Compute the start order for a stage: every active driver that has no
 * `start_event` on this stage yet, sorted by class priority and inverse
 * cumulative rally time (slowest first within a class).
 *
 * Shared by the start-order endpoint (preview) and the start endpoint
 * (which schedules these drivers). Totals are produced by the same domain
 * logic that builds submitted results, so penalties are included.
 */
export async function loadStartOrder(stageId: number): Promise<StartOrderEntry[]> {
	const [rows, rawStarts, rawFinishes] = await Promise.all([
		sql`
			SELECT
				d.id,
				d.name,
				d.tag                 AS rfid_tag,
				d.class_id,
				c.name                AS class_name,
				c.start_priority      AS class_start_priority
			FROM drivers d
			JOIN classes c ON c.id = d.class_id
			WHERE d.active = true
			  AND NOT EXISTS (
				SELECT 1 FROM start_events se
				WHERE se.driver_id = d.id AND se.stage_id = ${stageId}
			  )
		`,
		sql`
			SELECT
				se.driver_id,
				se.stage_id,
				se.ts_ms,
				d.uuid::text  AS driver_uuid,
				d.name        AS driver_name,
				d.tag         AS driver_tag,
				d.class_id,
				c.name        AS class_name,
				s.name        AS stage_name
			FROM start_events se
			JOIN drivers d ON d.id = se.driver_id AND d.active = true
			JOIN classes c ON c.id = d.class_id
			JOIN stages  s ON s.id = se.stage_id
		`,
		sql`SELECT stage_id, timestamp, tag, dnf, penalty_ms FROM finish_events`
	]);

	const stageTimes = buildStageTimes(
		rawStarts.map((se) => ({
			driver_id: se.driver_id as number,
			stage_id: se.stage_id as number,
			ts_ms: Number(se.ts_ms),
			driver_uuid: se.driver_uuid as string,
			driver_name: se.driver_name as string,
			driver_tag: se.driver_tag as string,
			class_id: se.class_id as number,
			class_name: se.class_name as string,
			stage_name: se.stage_name as string
		})),
		rawFinishes.map((fe) => ({
			stage_id: fe.stage_id as number,
			tag: fe.tag as string,
			timestamp: Number(fe.timestamp),
			penalty_ms: Number(fe.penalty_ms ?? 0),
			dnf: Boolean(fe.dnf)
		}))
	);
	const totals = new Map<number, number>();
	for (const st of stageTimes) {
		if (st.elapsed_ms === null) continue;
		totals.set(st.driver_id, (totals.get(st.driver_id) ?? 0) + st.elapsed_ms);
	}

	const drivers: StartOrderDriver[] = rows.map((r) => ({
		id: Number(r.id),
		name: r.name,
		rfid_tag: r.rfid_tag,
		class_id: Number(r.class_id),
		class_name: r.class_name,
		class_start_priority: Number(r.class_start_priority),
		total_ms: totals.get(Number(r.id)) ?? null
	}));

	return computeStartOrder(drivers);
}
