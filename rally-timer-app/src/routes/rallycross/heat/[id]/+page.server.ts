import { error } from '@sveltejs/kit';
import { sql } from '$lib/server/db';

export async function load({ params }: { params: { id: string } }) {
	const heatId = Number(params.id);
	if (!heatId) throw error(400, 'Invalid heat id');

	const [heat] = await sql<
		{
			id: number;
			number: number;
			required_laps: number;
			started_at: number | null;
			closed_at: number | null;
		}[]
	>`SELECT id, number, required_laps, started_at, closed_at FROM rallycross_heats WHERE id = ${heatId}`;
	if (!heat) throw error(404, 'Heat not found');

	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;
	if (!cfg) throw error(500, 'Rallycross configuration not found');

	const entries = await sql<
		{ driver_id: number; driver_name: string; class_name: string; tag: string }[]
	>`
		SELECT rhe.driver_id, d.name AS driver_name, c.name AS class_name, d.tag
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id  = rhe.driver_id
		JOIN classes c ON c.id  = d.class_id
		WHERE rhe.heat_id = ${heatId}
		ORDER BY d.name
	`;

	const startedAt = heat.started_at !== null ? Number(heat.started_at) : null;
	const closedAt = heat.closed_at !== null ? Number(heat.closed_at) : null;

	// Fetch all gate events for this heat in one query, using heat.started_at as window start.
	// This covers all drivers regardless of whether their per-driver ts_ms was set.
	const rawEvents =
		cfg.gate_id && startedAt !== null
			? await sql<{ tag: string; timestamp: number }[]>`
					SELECT tag, timestamp
					FROM gate_events
					WHERE gate_id = ${cfg.gate_id}
					  AND timestamp >= ${startedAt}
					  AND timestamp <= ${closedAt ?? Number.MAX_SAFE_INTEGER}
					ORDER BY tag, timestamp
				`
			: [];

	// Group timestamps by tag
	const eventsByTag = new Map<string, number[]>();
	for (const e of rawEvents) {
		const ts = Number(e.timestamp);
		const arr = eventsByTag.get(e.tag) ?? [];
		arr.push(ts);
		eventsByTag.set(e.tag, arr);
	}

	const drivers = entries.map((e) => {
		const timestamps = eventsByTag.get(e.tag) ?? [];

		// Mark which passes survive the cooldown filter
		const counted: boolean[] = new Array(timestamps.length).fill(false);
		if (timestamps.length > 0) {
			counted[0] = true;
			let lastKept = timestamps[0];
			for (let i = 1; i < timestamps.length; i++) {
				if (timestamps[i] - lastKept >= cfg.cooldown_ms) {
					counted[i] = true;
					lastKept = timestamps[i];
				}
			}
		}

		return {
			driver_id: e.driver_id,
			driver_name: e.driver_name,
			class_name: e.class_name,
			tag: e.tag,
			passes: timestamps.map((ts, i) => ({ timestamp: ts, counted: counted[i] }))
		};
	});

	return {
		heat: {
			id: heat.id,
			number: heat.number,
			required_laps: heat.required_laps,
			started_at: startedAt,
			closed_at: closedAt
		},
		cooldown_ms: cfg.cooldown_ms,
		gate_configured: cfg.gate_id !== null,
		drivers
	};
}
