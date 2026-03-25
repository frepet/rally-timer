import { sql } from '../../../../../lib/server/db';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const rallyId = Number(params.id);
	if (!Number.isFinite(rallyId)) {
		return json({ error: 'Invalid rallyId' }, { status: 400 });
	}

	const [rally] = await sql`SELECT id, name FROM rallies WHERE id = ${rallyId}`;

	const drivers = await sql`
		SELECT d.id, d.name, d.tag AS rfid_tag, d.class_id, c.name AS class_name
		FROM rally_drivers rd
		JOIN drivers d ON d.id = rd.driver_id
		JOIN classes c ON c.id = d.class_id
		WHERE rd.rally_id = ${rallyId}
	`;

	const stages = await sql`
		SELECT id, name FROM stages WHERE rally_id = ${rallyId} ORDER BY id
	`;

	const start_events = await sql`
		SELECT se.id, se.stage_id, se.driver_id, se.ts_ms AS ts
		FROM start_events se
		JOIN stages s ON s.id = se.stage_id
		WHERE s.rally_id = ${rallyId}
	`;

	const finish_events = await sql`
		SELECT fe.id, fe.stage_id, fe.timestamp AS ts, fe.tag
		FROM finish_events fe
		JOIN stages s ON s.id = fe.stage_id
		WHERE s.rally_id = ${rallyId}
	`;

	return json({ rally, drivers, stages, start_events, finish_events });
};
