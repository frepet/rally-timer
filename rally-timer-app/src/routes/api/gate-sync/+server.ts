import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { gateSyncSchema } from '../../../lib/server/schemas';

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
	const parsed = gateSyncSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { events } = parsed.data;
	const now = Date.now();
	ensureWal();

	const results: { stored: number; finish_added: number; errors: string[] } = {
		stored: 0,
		finish_added: 0,
		errors: []
	};

	const insertEvent = db.prepare(
		`INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
		 VALUES (?, ?, ?, ?, ?)`
	);

	const findGate = db.prepare('SELECT id, stage_id FROM gates WHERE id = ?');
	const insertFinish = db.prepare(
		`INSERT INTO finish_events (stage_id, timestamp, tag) VALUES (?, ?, ?)`
	);
	const updateLastSeen = db.prepare('UPDATE gates SET last_seen = ? WHERE id = ?');

	for (const evt of events) {
		try {
			const gate = findGate.get(evt.gate_id) as { id: string; stage_id: number | null } | undefined;
			if (!gate) {
				results.errors.push(`Gate ${evt.gate_id} not registered`);
				continue;
			}

			insertEvent.run(evt.gate_id, evt.tag, evt.timestamp_ms, evt.rssi ?? null, now);
			results.stored++;

			// Always add to finish_events (store all passes)
			// The results view uses MIN(timestamp) so only the first finish counts
			if (gate.stage_id) {
				insertFinish.run(gate.stage_id, evt.timestamp_ms, evt.tag);
				results.finish_added++;
			}

			updateLastSeen.run(now, evt.gate_id);
		} catch (e) {
			results.errors.push(`Error processing event: ${e}`);
		}
	}

	return json(results, { status: 200 });
}
