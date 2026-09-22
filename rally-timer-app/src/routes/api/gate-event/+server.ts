import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { requireGateCrypto } from '../../../lib/server/gateAuth';
import { gateEventSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';
import { captureGatePass } from '$lib/server/eventGates';
import { heatIsComplete } from '$lib/domain/heatCompletion';

export async function POST(event: RequestEvent): Promise<Response> {
	let rawBody: string;
	try {
		rawBody = await event.request.text();
	} catch {
		throw error(400, 'Could not read request body');
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = gateEventSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { gate_id, timestamp_ms, tag, rssi } = parsed.data;
	const now = Date.now();

	const [gate] = await sql<
		{
			id: string;
			stage_id: number | null;
			public_key: string | null;
			status: string;
		}[]
	>`SELECT id, stage_id, public_key, status FROM gates WHERE id = ${gate_id}`;
	if (!gate) throw error(404, 'Gate not registered');

	await requireGateCrypto(event, gate, rawBody);

	const row = await sql.begin(async (transaction) => {
		const tx = transaction as unknown as typeof sql;
		const [inserted] =
			await tx`INSERT INTO gate_events (gate_id,tag,timestamp,rssi,synced_at) VALUES (${gate_id},${tag},${timestamp_ms},${rssi ?? null},${now}) ON CONFLICT (gate_id,tag,timestamp) DO NOTHING RETURNING id`;
		if (inserted) await captureGatePass(tx, gate_id, inserted.id, timestamp_ms, tag);
		await tx`UPDATE gates SET last_seen=${now} WHERE id=${gate_id}`;
		return inserted;
	});
	if (!row) return json({ stored: false, duplicate: true });

	try {
		await maybeAutoCloseHeat(gate_id, timestamp_ms, row.id);
	} catch (e) {
		console.error('Heat auto-close failed:', e);
	}

	await emitGateEvent({ gate_id, tag, rssi: rssi ?? null, timestamp_ms });

	return json({ stored: true, event_id: row.id }, { status: 201 });
}

async function maybeAutoCloseHeat(
	gate_id: string,
	timestamp_ms: number,
	passId: number
): Promise<void> {
	const [rx] = await sql<{ event_id: number; gate_id: string | null; cooldown_ms: number }[]>`
		SELECT r.event_id,r.gate_id,r.cooldown_ms FROM rallycross r JOIN events e ON e.id=r.event_id WHERE r.gate_id=${gate_id} AND NOT e.is_locked AND EXISTS (SELECT 1 FROM gate_event_events gee WHERE gee.event_id=r.event_id AND gee.gate_event_id=${passId})
	`;
	if (!rx?.gate_id || rx.gate_id !== gate_id) return;

	const [heat] = await sql<
		{
			id: number;
			required_laps: number;
			started_at: number;
		}[]
	>`
		SELECT id, required_laps, started_at
		FROM rallycross_heats
		WHERE event_id=${rx.event_id} AND started_at IS NOT NULL AND closed_at IS NULL
		LIMIT 1
	`;
	if (!heat) return;

	const entries = await sql<{ driver_id: number; tag: string; ts_ms: number; dnf: boolean }[]>`
		SELECT rhe.driver_id, d.tag, rhe.ts_ms, rhe.dnf
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id = rhe.driver_id
		WHERE rhe.heat_id = ${heat.id}
	`;

	const racing = entries.filter((e) => !e.dnf);
	const minStart = Math.min(...racing.map((e) => Number(e.ts_ms)));
	const allPasses = racing.length
		? await sql<{ tag: string; timestamp: number }[]>`
				SELECT ge.tag,ge.timestamp FROM gate_events ge JOIN gate_event_events gee ON gee.gate_event_id=ge.id
				WHERE gee.event_id=${rx.event_id} AND gate_id = ${gate_id}
				  AND tag = ANY(${racing.map((e) => e.tag)})
				  AND timestamp >= ${minStart}
				ORDER BY timestamp
			`
		: [];
	const allDone = heatIsComplete(entries, allPasses, heat.required_laps, rx.cooldown_ms);

	if (allDone) {
		await sql`
			UPDATE rallycross_heats SET closed_at = ${timestamp_ms}
			WHERE id = ${heat.id} AND closed_at IS NULL
		`;
	}
}
