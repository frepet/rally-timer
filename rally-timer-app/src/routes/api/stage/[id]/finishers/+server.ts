import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = Number(event.params.id);
	if (!Number.isFinite(id) || id <= 0) throw error(400, 'Invalid id');

	const rows = await sql`
		SELECT
			fe.id         AS finish_event_id,
			fe.timestamp  AS timestamp,
			fe.penalty_ms AS penalty_ms,
			d.id          AS driver_id,
			d.name        AS driver_name
		FROM finish_events fe
		JOIN drivers d ON d.tag = fe.tag
		WHERE fe.stage_id = ${id}
		  AND fe.dnf = false
		ORDER BY fe.timestamp ASC
	`;

	return json(
		rows.map((r) => ({
			finish_event_id: Number(r.finish_event_id),
			timestamp: Number(r.timestamp),
			penalty_ms: Number(r.penalty_ms ?? 0),
			driver_id: Number(r.driver_id),
			driver_name: r.driver_name as string
		}))
	);
}
