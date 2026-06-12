import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { classUpdateSchema } from '../../../../lib/server/schemas';

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
	const parsed = classUpdateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	try {
		const [row] = await sql`
			UPDATE classes
			SET
				name = ${parsed.data.name},
				start_priority = COALESCE(${parsed.data.start_priority ?? null}, start_priority)
			WHERE id = ${id}
			RETURNING id, name, start_priority
		`;
		if (!row) throw error(404, 'Class not found');
		return json(row);
	} catch (e) {
		if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
			throw error(409, 'A class with that name already exists');
		}
		throw e;
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');

	try {
		const result = await sql`DELETE FROM classes WHERE id = ${id}`;
		if (result.count === 0) throw error(404, 'Class not found');
		return new Response(null, { status: 204 });
	} catch (e) {
		// drivers.class_id is ON DELETE RESTRICT — surface a conflict instead of a 500
		if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23503') {
			throw error(409, 'Class has drivers and cannot be deleted');
		}
		throw e;
	}
}
