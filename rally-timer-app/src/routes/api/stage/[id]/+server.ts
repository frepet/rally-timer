import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

// Update stage (only name)
export async function PATCH(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const { name } = await event.request.json();

	if (!name || !name.trim()) {
		return json({ error: 'Stage name required' }, { status: 400 });
	}

	const row = db
		.prepare('UPDATE stages SET name = ? WHERE id = ? RETURNING id, rally_id, name')
		.get(name.trim(), id);

	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}

// Delete stage
export async function DELETE(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const res = db.prepare('DELETE FROM stages WHERE id = ?').run(id);
	return new Response(null, { status: res.changes > 0 ? 204 : 404 });
}
