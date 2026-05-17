import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { countStageEvents } from '../../../lib/domain/stage';

export async function GET(): Promise<Response> {
	const rows = await sql`
		SELECT
			s.id,
			s.name,
			(SELECT COUNT(*)::int FROM start_events  WHERE stage_id = s.id) AS start_count,
			(SELECT COUNT(*)::int FROM finish_events WHERE stage_id = s.id) AS finish_count
		FROM stages s
		ORDER BY s.id
	`;
	return json(
		rows.map((r) => ({
			id: r.id,
			name: r.name,
			event_count: countStageEvents(Number(r.start_count), Number(r.finish_count))
		}))
	);
}

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
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
		INSERT INTO stages (name) VALUES (${name.trim()})
		RETURNING id, name
	`;
	return json(row, { status: 201 });
}
