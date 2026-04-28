import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { classCreateSchema } from '../../../lib/server/schemas';

export async function GET(): Promise<Response> {
	const rows = await sql`SELECT id, name, start_priority FROM classes ORDER BY name`;
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
	const parsed = classCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	try {
		const [row] = await sql`
			INSERT INTO classes (name, start_priority) VALUES (${parsed.data.name}, ${parsed.data.start_priority})
			RETURNING id, name, start_priority
		`;
		return json(row, { status: 201 });
	} catch (e) {
		if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
			throw error(409, 'A class with that name already exists');
		}
		throw e;
	}
}
