import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { finishCreateSchema } from '../../../lib/server/schemas';

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
	const parsed = finishCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
	const { stage_id, tag } = parsed.data;
	ensureWal();

	// Check if driver has already finished this stage
	const existing = db
		.prepare('SELECT id FROM finish_events WHERE stage_id = ? AND tag = ?')
		.get(stage_id, tag);
	if (existing) {
		return json(
			{ message: 'Finish already recorded for this driver on this stage' },
			{ status: 200 }
		);
	}

	const ts_ms = Date.now();
	const row = db
		.prepare(
			`INSERT INTO finish_events(stage_id, timestamp, tag)
		 VALUES(?, ?, ?)
		 RETURNING id, stage_id, timestamp, tag;`
		)
		.get(stage_id, ts_ms, tag);
	return json(row, { status: 201 });
}
