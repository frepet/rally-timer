import { json } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import {
	buildHeatLeaderboard,
	buildOverallLeaderboard,
	suggestNextHeatGroups,
	type HeatEntry
} from '../../../../lib/domain/rallycross';

export async function GET(): Promise<Response> {
	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number; max_per_heat: number }[]>`
		SELECT gate_id, cooldown_ms, max_per_heat FROM rallycross WHERE id = 1
	`;

	// Get all active drivers not yet in any heat — they go at the bottom of standings
	const allActiveDrivers = await sql<{
		driver_id: number;
		driver_name: string;
		class_id: number;
		class_name: string;
		driver_uuid: string;
	}[]>`
		SELECT d.id AS driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
		       d.uuid::text AS driver_uuid
		FROM drivers d
		JOIN classes c ON c.id = d.class_id
		WHERE d.active = true
		ORDER BY c.start_priority DESC, d.name
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

	// Build heat results for drivers that have participated in heats
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

					const heatEntries: HeatEntry[] = await Promise.all(
						entries.map(async (e) => {
							const passes = cfg.gate_id
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
								ts_ms: Number(e.ts_ms),
								dnf: e.dnf,
								dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null,
								passes: passes.map((p) => Number(p.timestamp)),
								manual_position: null
							};
						})
					);

					return buildHeatLeaderboard(
						heatEntries,
						heat.number,
						heat.required_laps,
						cfg.cooldown_ms
					);
				})
		)
	).flat();

	const overall = buildOverallLeaderboard(allHeatResults);

	// Drivers not in any heat yet — append them after those who have run
	const driverIdsInHeats = new Set(overall.map((r) => r.driver_id));
	const notYetRun = allActiveDrivers.filter((d) => !driverIdsInHeats.has(d.driver_id));

	const orderedStandings = [
		...overall,
		...notYetRun.map((d) => ({
			driver_id: d.driver_id,
			driver_name: d.driver_name,
			class_id: d.class_id,
			class_name: d.class_name,
			driver_uuid: d.driver_uuid,
			total_points: 0,
			best_total_ms: null,
			best_heat_number: null,
			heat_results: []
		}))
	];

	const groups = suggestNextHeatGroups(orderedStandings, cfg.max_per_heat);
	return json({
		groups,
		standings: orderedStandings.map((s) => ({
			driver_id: s.driver_id,
			driver_name: s.driver_name,
			class_id: s.class_id,
			class_name: s.class_name,
			best_total_ms: s.best_total_ms,
			heat_count: s.heat_results.length
		}))
	});
}
