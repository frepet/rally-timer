import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { requireGateCrypto } from '../../../lib/server/gateAuth';
import { gateEventSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';
import { computeLaps } from '../../../lib/domain/rallycross';

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
			token: string | null;
			public_key: string | null;
			status: string;
		}[]
	>`SELECT id, stage_id, token, public_key, status FROM gates WHERE id = ${gate_id}`;
	if (!gate) throw error(404, 'Gate not registered');

	await requireGateCrypto(event, gate, rawBody);

	const [row] = await sql`
		INSERT INTO gate_events (gate_id, tag, timestamp, rssi, synced_at)
		VALUES (${gate_id}, ${tag}, ${timestamp_ms}, ${rssi ?? null}, ${now})
		ON CONFLICT (gate_id, tag, timestamp) DO NOTHING
		RETURNING id
	`;

	await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${gate_id}`;

	if (!row) return json({ stored: false, duplicate: true }, { status: 200 });

	if (gate.stage_id) {
		await sql`
			INSERT INTO finish_events (stage_id, timestamp, tag)
			VALUES (${gate.stage_id}, ${timestamp_ms}, ${tag})
		`;
	}

	try {
		await maybeAutoCloseHeat(gate_id, timestamp_ms);
	} catch (e) {
		console.error('Heat auto-close failed:', e);
	}

	await emitGateEvent({ gate_id, tag, rssi: rssi ?? null, timestamp_ms });

	return json({ stored: true, event_id: row.id }, { status: 201 });
}

async function maybeAutoCloseHeat(gate_id: string, timestamp_ms: number): Promise<void> {
	const [rx] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
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
		WHERE started_at IS NOT NULL AND closed_at IS NULL
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
				SELECT tag, timestamp FROM gate_events
				WHERE gate_id = ${gate_id}
				  AND tag = ANY(${racing.map((e) => e.tag)})
				  AND timestamp >= ${minStart}
				ORDER BY timestamp
			`
		: [];
	const passesByTag = new Map<string, number[]>();
	for (const p of allPasses) {
		const list = passesByTag.get(p.tag) ?? [];
		list.push(Number(p.timestamp));
		passesByTag.set(p.tag, list);
	}

	const allDone = racing.every((e) => {
		const start = Number(e.ts_ms);
		const laps = computeLaps(
			(passesByTag.get(e.tag) ?? []).filter((ts) => ts >= start),
			start,
			rx.cooldown_ms
		);
		return laps.length >= heat.required_laps;
	});

	if (allDone) {
		await sql`
			UPDATE rallycross_heats SET closed_at = ${timestamp_ms}
			WHERE id = ${heat.id} AND closed_at IS NULL
		`;
	}
}
