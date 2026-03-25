import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function PATCH(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const { name } = await event.request.json();

	if (!name || !name.trim()) {
		return json({ error: 'Stage name required' }, { status: 400 });
	}

	const [row] = await sql`
		UPDATE stages SET name = ${name.trim()} WHERE id = ${id} RETURNING id, rally_id, name
	`;

	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}

export async function DELETE(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const result = await sql`DELETE FROM stages WHERE id = ${id}`;
	return new Response(null, { status: result.count > 0 ? 204 : 404 });
}
