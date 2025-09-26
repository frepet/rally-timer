import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const result = db.prepare('DELETE FROM gate_events WHERE id = ?;').run(event.params.id);
	return json(result);
}

export async function PATCH(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const body = await event.request.json();
	const ts = Number(body?.timestamp);
	if (!Number.isFinite(ts)) return json({ error: 'timestamp (ms) required' }, { status: 400 });
	const row = db
		.prepare(`UPDATE gate_events SET timestamp = ? WHERE id = ? RETURNING id, stage_id, timestamp`)
		.get(ts, id);
	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}
