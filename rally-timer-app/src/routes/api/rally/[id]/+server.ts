import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';
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
	const result = db.prepare('UPDATE rallies SET name = ? WHERE id = ?').run(name, id);
	if (result.changes === 0) throw error(404, 'Rally not found');

	return json({ id, name });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid rally ID');

	// Check if rally has any stages with events
	const hasEvents = db
		.prepare(
			`
		SELECT 1 FROM stages s
		JOIN start_events se ON se.stage_id = s.id
		WHERE s.rally_id = ?
		LIMIT 1
	`
		)
		.get(id);

	if (hasEvents) {
		throw error(409, 'Cannot delete rally with existing events');
	}

	const result = db.prepare('DELETE FROM rallies WHERE id = ?').run(id);
	if (result.changes === 0) throw error(404, 'Rally not found');

	return json({ success: true });
}
