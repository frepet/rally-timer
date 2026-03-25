import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { rallyCreateSchema } from '../../../lib/server/schemas';

export async function GET(): Promise<Response> {
	const rows = await sql`SELECT id, name FROM rallies ORDER BY id`;
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
	const parsed = rallyCreateSchema.safeParse(body);
	if (!parsed.success) {
		return json({ errors: parsed.error.flatten() }, { status: 400 });
	}
	const [row] = await sql`INSERT INTO rallies(name) VALUES(${parsed.data.name}) RETURNING id, name`;
	return json(row, { status: 201 });
}
