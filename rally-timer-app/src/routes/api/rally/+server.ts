import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { rallyCreateSchema } from '../../../lib/server/schemas';

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
	}
}

export async function GET(): Promise<Response> {
	ensureWal();
	const rows = db.prepare('SELECT id, name FROM rallies ORDER BY id;').all();
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
	ensureWal();
	const row = db
		.prepare('INSERT INTO rallies(name) VALUES(?) RETURNING id, name;')
		.get(parsed.data.name);
	return json(row, { status: 201 });
}
