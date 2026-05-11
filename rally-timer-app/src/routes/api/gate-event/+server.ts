import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { gateEventSchema } from '../../../lib/server/schemas';
import { emitGateEvent } from '../../../lib/server/gateEvents';
import { computeLaps, filterByCooldown } from '../../../lib/domain/rallycross';

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

	if (gate.stage_id) {
		await sql`
			INSERT INTO finish_events (stage_id, timestamp, tag)
			VALUES (${gate.stage_id}, ${timestamp_ms}, ${tag})
		`;
	}

	// Auto-close rallycross heat if all entries have finished required laps
	await maybeAutoCloseHeat(gate_id);

	await emitGateEvent({ gate_id, tag, rssi: rssi ?? null, timestamp_ms });

	return json({ stored: true, event_id: row }, { status: 201 });
}

async function maybeAutoCloseHeat(gate_id: string): Promise<void> {
	// Is this gate the rallycross gate and is there an active heat?
	const [rx] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;
	if (!rx?.gate_id || rx.gate_id !== gate_id) return;

	const [heat] = await sql<{
		id: number;
		required_laps: number;
		started_at: number;
	}[]>`
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

	const allDone = await Promise.all(
		entries.map(async (e) => {
			if (e.dnf) return true;
			const passes = await sql<{ timestamp: number }[]>`
				SELECT timestamp FROM gate_events
				WHERE gate_id = ${gate_id} AND tag = ${e.tag}
				  AND timestamp >= ${Number(e.ts_ms)}
				ORDER BY timestamp
			`;
			const laps = computeLaps(
				passes.map((p) => Number(p.timestamp)),
				Number(e.ts_ms),
				rx.cooldown_ms
			);
			return laps.length >= heat.required_laps;
		})
	);

	if (allDone.every(Boolean)) {
		await sql`UPDATE rallycross_heats SET closed_at = ${Date.now()} WHERE id = ${heat.id}`;
	}
}
