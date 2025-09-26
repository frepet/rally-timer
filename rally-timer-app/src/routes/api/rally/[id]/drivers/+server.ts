import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';
import { idParam, rallyDriverAddSchema } from '../../../../../lib/server/schemas';

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
	}
}

export async function GET(event: RequestEvent): Promise<Response> {
	const idRaw = event.params.id;
	if (!idRaw) throw error(400, 'Missing rally id');
	const rallyId = idParam.parse(idRaw);
	ensureWal();
	const rows = db
		.prepare(
			`SELECT d.id, d.name, d.tag, d.class_id, c.name AS class_name
		 FROM rally_drivers rd
		 JOIN drivers d ON d.id = rd.driver_id
		 LEFT JOIN classes c ON c.id = d.class_id
		 WHERE rd.rally_id = ?
		 ORDER BY d.name;`
		)
		.all(rallyId);
	return json(rows);
}

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const idRaw = event.params.id;
	if (!idRaw) throw error(400, 'Missing rally id');
	const rallyId = idParam.parse(idRaw);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = rallyDriverAddSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
	ensureWal();
	db.prepare('INSERT OR IGNORE INTO rally_drivers(rally_id, driver_id) VALUES(?, ?);').run(
		rallyId,
		parsed.data.driver_id
	);
	const row = db
		.prepare(
			`SELECT d.id, d.name, d.tag, d.class_id, c.name AS class_name
		 FROM drivers d
		 LEFT JOIN classes c ON c.id = d.class_id
		 WHERE d.id = ?;`
		)
		.get(parsed.data.driver_id);
	return json(row, { status: 201 });
}
