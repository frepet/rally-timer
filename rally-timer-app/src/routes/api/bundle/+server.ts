import { requireEvent } from '$lib/server/eventContext';
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'rally');
	const [drivers, stages, start_events, finish_events] = await Promise.all([
		sql`
			SELECT d.id, d.uuid::text AS uuid, d.name, d.tag AS rfid_tag, d.class_id, c.name AS class_name, d.active
			FROM drivers d
			JOIN classes c ON c.id = d.class_id
			JOIN event_participants ep ON ep.driver_id = d.id AND ep.event_id = ${appEvent.id}
			ORDER BY c.start_priority DESC, d.name ASC
		`,
		sql`SELECT id, name, is_closed FROM stages WHERE event_id = ${appEvent.id} ORDER BY id`,
		sql`SELECT id, stage_id, driver_id, ts_ms AS ts FROM start_events WHERE stage_id IN (SELECT id FROM stages WHERE event_id = ${appEvent.id}) ORDER BY ts_ms`,
		sql`SELECT id, stage_id, timestamp AS ts, tag, dnf, penalty_ms, synthetic FROM finish_events WHERE stage_id IN (SELECT id FROM stages WHERE event_id = ${appEvent.id}) ORDER BY timestamp`
	]);

	return json({ drivers, stages, start_events, finish_events });
}
