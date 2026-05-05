import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

export async function GET(): Promise<Response> {
	const rows = await sql`
		SELECT
			s.id,
			s.name,
			(SELECT COUNT(*)::int FROM finish_events WHERE stage_id = s.id) +
			(SELECT COUNT(*)::int FROM start_events  WHERE stage_id = s.id) AS event_count
		FROM stages s
		ORDER BY s.id
	`;
	return json(rows);
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
