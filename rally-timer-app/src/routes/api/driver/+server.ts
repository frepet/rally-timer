import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

const createDriverSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(100)
		.transform((s) => s.trim()),
	class_id: z.union([z.number(), z.string().regex(/^\d+$/)]).transform((v) => Number(v)),
	tag: z
		.string()
		.min(1)
		.max(50)
		.transform((s) => s.trim())
});

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		// pragma is best-effort; ignore errors silently (acceptable here)
	}
}

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = createDriverSchema.safeParse(body);
	if (!parsed.success) {
		return json({ errors: parsed.error.flatten() }, { status: 400 });
	}
	const { name, class_id, tag } = parsed.data;
	ensureWal();
	const row = db
		.prepare(
			`INSERT INTO drivers(name, class_id, tag)
			 VALUES(?, ?, ?)
			 RETURNING id, name, class_id, tag;`
		)
		.get(name, class_id, tag);
	return json(row, { status: 201 });
}

export async function GET(): Promise<Response> {
	ensureWal();
	const rows = db
		.prepare(
			`SELECT d.id, d.name, d.class_id, d.tag, c.name AS class_name
			 FROM drivers d
			 LEFT JOIN classes c ON c.id = d.class_id
			 ORDER BY d.id;`
		)
		.all();
	return json(rows);
}

