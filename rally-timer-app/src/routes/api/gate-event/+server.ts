import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { gateEventSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';

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

	const [gate] = await sql`SELECT id, stage_id FROM gates WHERE id = ${gate_id}`;
	if (!gate) throw error(404, 'Gate not registered');

	const [row] = await sql`
		INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
		VALUES (${gate_id}, ${tag}, ${timestamp_ms}, ${rssi ?? null}, ${now})
		RETURNING id
	`;

	await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${gate_id}`;

	// Always add to finish_events (store all passes)
	// The results view uses MIN(timestamp) so only the first finish counts
	if (gate.stage_id) {
		await sql`
			INSERT INTO finish_events (stage_id, timestamp, tag)
			VALUES (${gate.stage_id}, ${timestamp_ms}, ${tag})
		`;
	} else {
		emitGateEvent({ gate_id, tag });
	}

	return json({ stored: true, event_id: row }, { status: 201 });
}
