import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const ts = Number((body as { timestamp?: unknown })?.timestamp);
	if (!Number.isInteger(ts) || ts <= 0)
		return json({ error: 'timestamp (ms) required' }, { status: 400 });
	const [row] = await sql`
		UPDATE start_events SET ts_ms = ${ts} WHERE id = ${id}
		RETURNING id, stage_id, driver_id, ts_ms
	`;
	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
	const result = await sql`DELETE FROM start_events WHERE id = ${id}`;
	return new Response(null, { status: result.count ? 204 : 404 });
}
