import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { requireGateCrypto } from '../../../lib/server/gateAuth';
import { gateSyncSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';
import { log } from '../../../lib/server/log';

export async function POST(event: RequestEvent): Promise<Response> {
	let rawBody: string;
	try {
		rawBody = await event.request.text();
	} catch {
		throw error(400, 'Could not read request body');
	}

	let bodyJson: unknown;
	try {
		bodyJson = JSON.parse(rawBody);
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = gateSyncSchema.safeParse(bodyJson);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { events } = parsed.data;
	const now = Date.now();

	// Resolve every distinct gate once (avoids a per-event SELECT) and
	// authenticate up front: a 401/403 must reject the whole batch.
	const gateIds = [...new Set(events.map((e) => e.gate_id))];
	const gateRows = gateIds.length
		? await sql<
				{
					id: string;
					stage_id: number | null;
					public_key: string | null;
					status: string;
				}[]
			>`
				SELECT id, stage_id, public_key, status FROM gates WHERE id = ANY(${gateIds})
			`
		: [];
	const gates = new Map(gateRows.map((g) => [g.id, g]));

	// Authenticate each gate via Ed25519. In practice a batch is always from
	// one gate, so the signature covers its own events.
	for (const gate of gateRows) {
		await requireGateCrypto(event, gate, rawBody);
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
			const inserted = await sql.begin(async (tx) => {
				const tsql = tx as unknown as typeof sql;
				const [row] = await tsql`
					INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
					VALUES (${evt.gate_id}, ${evt.tag}, ${evt.timestamp_ms}, ${evt.rssi ?? null}, ${now})
					ON CONFLICT (gate_id, tag, timestamp) DO NOTHING
					RETURNING id
				`;
				if (!row) return false;
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
		for (const e of emit) {
			try {
				await emitGateEvent(e);
			} catch (err) {
				log.warn('gate-sync NOTIFY failed', { error: String(err) });
			}
		}
	}

	const status = failed > 0 ? 500 : 200;
	return json({ stored, finish_added: finishAdded, skipped, failed }, { status });
}
