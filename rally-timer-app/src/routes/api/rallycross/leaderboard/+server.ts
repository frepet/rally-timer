import { json } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import {
	buildHeatLeaderboard,
	buildOverallLeaderboard,
	type HeatEntry
} from '../../../../lib/domain/rallycross';

export async function GET(): Promise<Response> {
	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;

	const heats = await sql<{
		id: number;
		number: number;
		required_laps: number;
		started_at: number | null;
		closed_at: number | null;
	}[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats ORDER BY number
	`;

	if (heats.length === 0 || !cfg.gate_id) {
		return json([]);
	}

	// For each heat, fetch its entries + gate passes
	const allHeatResults = (
		await Promise.all(
			heats
				.filter((h) => h.started_at !== null)
				.map(async (heat) => {
					const entries = await sql<{
						driver_id: number;
						driver_name: string;
						class_id: number;
						class_name: string;
						driver_uuid: string;
						tag: string;
						ts_ms: number;
						dnf: boolean;
						dnf_time_ms: number | null;
					}[]>`
						SELECT rhe.driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
						       d.uuid::text AS driver_uuid, d.tag, rhe.ts_ms, rhe.dnf, rhe.dnf_time_ms
						FROM rallycross_heat_entries rhe
						JOIN drivers d ON d.id  = rhe.driver_id
						JOIN classes c ON c.id  = d.class_id
						WHERE rhe.heat_id = ${heat.id}
					`;

					const heatEntries: (HeatEntry & { driver_uuid: string })[] = await Promise.all(
						entries.map(async (e) => {
							const passes = await sql<{ timestamp: number }[]>`
								SELECT timestamp FROM gate_events
								WHERE gate_id = ${cfg.gate_id!} AND tag = ${e.tag}
								  AND timestamp >= ${Number(e.ts_ms)}
								ORDER BY timestamp
							`;
							return {
								driver_id: e.driver_id,
								driver_name: e.driver_name,
								class_id: e.class_id,
								class_name: e.class_name,
								driver_uuid: e.driver_uuid,
								tag: e.tag,
								ts_ms: Number(e.ts_ms),
								dnf: e.dnf,
								dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null,
								passes: passes.map((p) => Number(p.timestamp))
							};
						})
					);

					return buildHeatLeaderboard(
						heatEntries,
						heat.number,
						heat.required_laps,
						cfg.cooldown_ms
					).map((r, _, arr) => {
						// Attach driver_uuid from the input (domain result doesn't carry it)
						const entry = heatEntries.find((e) => e.driver_id === r.driver_id);
						return { ...r, driver_uuid: entry?.driver_uuid ?? '' };
					});
				})
		)
	).flat();

	const overall = buildOverallLeaderboard(allHeatResults);

	// Re-attach driver_uuid from heat results
	const uuidMap = new Map<number, string>();
	for (const r of allHeatResults) {
		if (!uuidMap.has(r.driver_id)) uuidMap.set(r.driver_id, (r as { driver_uuid?: string }).driver_uuid ?? '');
	}
	const withUuid = overall.map((r) => ({ ...r, driver_uuid: uuidMap.get(r.driver_id) ?? '' }));

	return json(withUuid);
}
