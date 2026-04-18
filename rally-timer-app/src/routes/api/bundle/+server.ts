import { json } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';

export async function GET(): Promise<Response> {
	const [drivers, stages, start_events, finish_events] = await Promise.all([
		sql`
			SELECT d.id, d.name, d.tag AS rfid_tag, d.class_id, c.name AS class_name, d.active
			FROM drivers d
			JOIN classes c ON c.id = d.class_id
			WHERE d.active = true
			ORDER BY d.name
		`,
		sql`SELECT id, name FROM stages ORDER BY id`,
		sql`SELECT id, stage_id, driver_id, ts_ms AS ts FROM start_events ORDER BY ts_ms`,
		sql`SELECT id, stage_id, timestamp AS ts, tag, dnf FROM finish_events ORDER BY timestamp`
	]);

	return json({ drivers, stages, start_events, finish_events });
}
