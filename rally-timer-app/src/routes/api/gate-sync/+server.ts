import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { gateSyncSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';

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

	const results: { stored: number; finish_added: number; errors: string[] } = {
		stored: 0,
		finish_added: 0,
		errors: []
	};

	for (const evt of events) {
		try {
			const [gate] = await sql`SELECT id, stage_id FROM gates WHERE id = ${evt.gate_id}`;
			if (!gate) {
				results.errors.push(`Gate ${evt.gate_id} not registered`);
				continue;
			}

			await sql`
				INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
				VALUES (${evt.gate_id}, ${evt.tag}, ${evt.timestamp_ms}, ${evt.rssi ?? null}, ${now})
			`;
			results.stored++;

			// Always add to finish_events (store all passes)
			// The results view uses MIN(timestamp) so only the first finish counts
			if (gate.stage_id) {
				await sql`
					INSERT INTO finish_events (stage_id, timestamp, tag)
					VALUES (${gate.stage_id}, ${evt.timestamp_ms}, ${evt.tag})
				`;
				results.finish_added++;
			}

			await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${evt.gate_id}`;

			await emitGateEvent({
				gate_id: evt.gate_id,
				tag: evt.tag,
				rssi: evt.rssi ?? null,
				timestamp_ms: evt.timestamp_ms
			});
		} catch (e) {
			results.errors.push(`Error processing event: ${e}`);
		}
	}

	return json(results, { status: 200 });
}
