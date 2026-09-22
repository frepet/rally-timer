import { requireEvent, requireMutableEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { countStageEvents } from '../../../lib/domain/stage';

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'rally');
	const rows = await sql`
		SELECT
			s.id,
			s.name,
			s.is_closed,
			(SELECT COUNT(*)::int FROM start_events  WHERE stage_id = s.id) AS start_count,
			(SELECT COUNT(*)::int FROM finish_events WHERE stage_id = s.id) AS finish_count
		FROM stages s WHERE s.event_id = ${appEvent.id}
		ORDER BY s.id
	`;
	return json(
		rows.map((r) => ({
			id: r.id,
			name: r.name,
			is_closed: r.is_closed,
			event_count: countStageEvents(Number(r.start_count), Number(r.finish_count))
		}))
	);
}

export async function POST(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'rally', sql);
		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			throw error(400, 'Invalid JSON');
		}
		const { name } = body as { name?: unknown };
		if (!name || typeof name !== 'string' || !name.trim()) {
			return json({ error: 'Stage name required' }, { status: 400 });
		}
		const [row] = await sql`
		INSERT INTO stages (name, event_id) VALUES (${name.trim()}, ${appEvent.id})
		RETURNING id, name
	`;
		return json(row, { status: 201 });
	});
}

const sql = db;
