import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { championshipCreateSchema } from '../../../lib/server/schemas';

export async function GET(): Promise<Response> {
	const rows = await sql`SELECT id, name, created_at FROM championships ORDER BY created_at`;
	return json(rows.map((r) => ({ ...r, created_at: Number(r.created_at) })));
}

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = championshipCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const [row] = await sql`
		INSERT INTO championships (name, created_at)
		VALUES (${parsed.data.name}, ${Date.now()})
		RETURNING id, name, created_at
	`;
	return json(row, { status: 201 });
}
