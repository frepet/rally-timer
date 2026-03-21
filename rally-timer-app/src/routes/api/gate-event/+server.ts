import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { gateEventSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
	}
}

export async function POST(event: RequestEvent): Promise<Response> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateEventSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { gate_id, timestamp_ms, tag, rssi } = parsed.data;
	const now = Date.now();
	ensureWal();

	const gate = db.prepare('SELECT id, stage_id FROM gates WHERE id = ?').get(gate_id);
	if (!gate) {
		throw error(404, 'Gate not registered');
	}

	const row = db
		.prepare(
			`INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
			 VALUES (?, ?, ?, ?, ?)
			 RETURNING id`
		)
		.get(gate_id, tag, timestamp_ms, rssi ?? null, now);

	db.prepare('UPDATE gates SET last_seen = ? WHERE id = ?').run(now, gate_id);

	// Always add to finish_events (store all passes)
	// The results view uses MIN(timestamp) so only the first finish counts
	if ((gate as { stage_id: number | null }).stage_id) {
		db.prepare(
			`INSERT INTO finish_events (stage_id, timestamp, tag)
			 VALUES (?, ?, ?)`
		).run((gate as { stage_id: number }).stage_id, timestamp_ms, tag);
	} else {
		emitGateEvent({ gate_id, tag });
	}

	return json({ stored: true, event_id: row }, { status: 201 });
}
