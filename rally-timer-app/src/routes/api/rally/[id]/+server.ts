import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { rallyCreateSchema } from '../../../../lib/server/schemas';

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid rally ID');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = rallyCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { name } = parsed.data;
	const result = await sql`UPDATE rallies SET name = ${name} WHERE id = ${id}`;
	if (result.count === 0) throw error(404, 'Rally not found');

	return json({ id, name });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid rally ID');

	const [hasEvents] = await sql`
		SELECT 1 FROM stages s
		JOIN start_events se ON se.stage_id = s.id
		WHERE s.rally_id = ${id}
		LIMIT 1
	`;

	if (hasEvents) throw error(409, 'Cannot delete rally with existing events');

	const result = await sql`DELETE FROM rallies WHERE id = ${id}`;
	if (result.count === 0) throw error(404, 'Rally not found');

	return json({ success: true });
}
