import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';
import { computeHeatResult, computeDnfTime, type HeatEntry } from '../../../../../../lib/domain/rallycross';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const heatId = Number(event.params.id);
	if (!heatId) throw error(400, 'Invalid heat id');

	const [heat] = await sql<{
		id: number;
		number: number;
		required_laps: number;
		started_at: number | null;
		closed_at: number | null;
	}[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats WHERE id = ${heatId}
	`;
	if (!heat) throw error(404, 'Värmelopp hittades inte');
	if (heat.started_at === null) throw error(409, 'Värmeloppet är inte startat');
	if (heat.closed_at !== null) throw error(409, 'Värmeloppet är redan stängt');

	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;

	const entries = await sql<{
		driver_id: number;
		driver_name: string;
		class_id: number;
		class_name: string;
		tag: string;
		ts_ms: number | null;
		dnf: boolean;
		dnf_time_ms: number | null;
	}[]>`
		SELECT rhe.driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
		       d.tag, rhe.ts_ms, rhe.dnf, rhe.dnf_time_ms
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id = rhe.driver_id
		JOIN classes c ON c.id = d.class_id
		WHERE rhe.heat_id = ${heatId}
	`;

	// Fetch gate passes for each driver within this heat's window
	const heatEntries: HeatEntry[] = await Promise.all(
		entries.map(async (e) => {
			const passes = cfg.gate_id && e.ts_ms
				? await sql<{ timestamp: number }[]>`
						SELECT timestamp FROM gate_events
						WHERE gate_id = ${cfg.gate_id} AND tag = ${e.tag}
						  AND timestamp >= ${Number(e.ts_ms)}
						ORDER BY timestamp
					`
				: [] as { timestamp: number }[];
			return {
				driver_id: e.driver_id,
				driver_name: e.driver_name,
				class_id: e.class_id,
				class_name: e.class_name,
				tag: e.tag,
				ts_ms: Number(e.ts_ms ?? 0),
				dnf: e.dnf,
				dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null,
				passes: passes.map((p) => Number(p.timestamp)),
				manual_position: null
			};
		})
	);

	const heatResults = heatEntries.map((e) =>
		computeHeatResult(e, heat.number, heat.required_laps, cfg.cooldown_ms)
	);
	const dnfTime = computeDnfTime(heatResults);
	const now = Date.now();

	// Mark unfinished entries as DNF
	for (const result of heatResults) {
		if (!result.finished && !result.dnf) {
			await sql`
				UPDATE rallycross_heat_entries
				SET dnf = true, dnf_time_ms = ${dnfTime}
				WHERE heat_id = ${heatId} AND driver_id = ${result.driver_id}
			`;
		}
	}

	await sql`UPDATE rallycross_heats SET closed_at = ${now} WHERE id = ${heatId}`;

	return json({ closed_at: now });
}
