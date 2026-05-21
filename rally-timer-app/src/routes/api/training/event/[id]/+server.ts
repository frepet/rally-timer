import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';
import { idParam } from '../../../../../lib/server/schemas';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	const parsed = idParam.safeParse(event.params.id);
	if (!parsed.success) throw error(400, 'Invalid id');
	const id = parsed.data;

	const [row] = await sql<{ id: number }[]>`
		DELETE FROM gate_events WHERE id = ${id} RETURNING id
	`;
	if (!row) throw error(404, 'Event not found');

	return json({ deleted: true });
}
