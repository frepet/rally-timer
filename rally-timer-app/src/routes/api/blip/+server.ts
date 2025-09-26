import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { blipCreateSchema } from '../../../lib/server/schemas';

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
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
	const parsed = blipCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
	const { stage_id, tag } = parsed.data;
	ensureWal();
	const ts_ms = Date.now();
	const row = db
		.prepare(
			`INSERT INTO blip_events(stage_id, timestamp, tag)
		 VALUES(?, ?, ?)
		 RETURNING id, stage_id, timestamp, tag;`
		)
		.get(stage_id, ts_ms, tag);
	return json(row, { status: 201 });
}
