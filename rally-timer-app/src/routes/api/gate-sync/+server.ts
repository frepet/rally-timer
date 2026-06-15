import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { requireGateToken } from '../../../lib/server/gateAuth';
import { gateSyncSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';
import { log } from '../../../lib/server/log';

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

	// Resolve every distinct gate once (avoids a per-event SELECT) and
	// authenticate up front: a 401 must reject the whole batch.
	const gateIds = [...new Set(events.map((e) => e.gate_id))];
	const gateRows = gateIds.length
		? await sql<{ id: string; stage_id: number | null; token: string | null }[]>`
				SELECT id, stage_id, token FROM gates WHERE id = ANY(${gateIds})
			`
		: [];
	const gates = new Map(gateRows.map((g) => [g.id, g]));
	for (const gate of gateRows) {
		requireGateToken(event, gate.token);
	}

	let stored = 0;
	let finishAdded = 0;
	let skipped = 0; // events for gates we don't know — permanent, reader can drop
	let failed = 0; // transient errors — reader must retry
	const emit: Parameters<typeof emitGateEvent>[0][] = [];

	for (const evt of events) {
		const gate = gates.get(evt.gate_id);
		if (!gate) {
			skipped++;
			continue;
		}
		try {
			// The pass and its derived finish are inserted atomically, so a
			// failure can never leave a stored pass with no finish (which the
			// gate_events ON CONFLICT would then make unrecoverable on retry).
			const inserted = await sql.begin(async (tx) => {
				const tsql = tx as unknown as typeof sql;
				const [row] = await tsql`
					INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
					VALUES (${evt.gate_id}, ${evt.tag}, ${evt.timestamp_ms}, ${evt.rssi ?? null}, ${now})
					ON CONFLICT (gate_id, tag, timestamp) DO NOTHING
					RETURNING id
				`;
				if (!row) return false; // duplicate — already have this pass
				if (gate.stage_id) {
					await tsql`
						INSERT INTO finish_events (stage_id, timestamp, tag)
						VALUES (${gate.stage_id}, ${evt.timestamp_ms}, ${evt.tag})
					`;
					finishAdded++;
				}
				return true;
			});
			if (inserted) {
				stored++;
				emit.push({
					gate_id: evt.gate_id,
					tag: evt.tag,
					rssi: evt.rssi ?? null,
					timestamp_ms: evt.timestamp_ms
				});
			}
		} catch (e) {
			failed++;
			log.error('gate-sync event insert failed', { gate_id: evt.gate_id, error: String(e) });
		}
	}

	if (stored > 0) {
		await sql`UPDATE gates SET last_seen = ${now} WHERE id = ANY(${gateIds})`;
		// NOTIFY is best-effort: a failure must not turn a committed batch into
		// a 500 that makes the reader re-send already-stored events.
		for (const e of emit) {
			try {
				await emitGateEvent(e);
			} catch (err) {
				log.warn('gate-sync NOTIFY failed', { error: String(err) });
			}
		}
	}

	// Any transient failure → non-2xx so the reader keeps the batch and retries
	// (re-sends are idempotent via the gate_events unique constraint).
	const status = failed > 0 ? 500 : 200;
	return json({ stored, finish_added: finishAdded, skipped, failed }, { status });
}
