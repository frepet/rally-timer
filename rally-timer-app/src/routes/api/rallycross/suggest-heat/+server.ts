import { json } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { fetchStartedHeatResults } from '../../../../lib/server/rallycrossData';
import { buildOverallLeaderboard, suggestNextHeatGroups } from '../../../../lib/domain/rallycross';

export async function GET(): Promise<Response> {
	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number; max_per_heat: number }[]>`
		SELECT gate_id, cooldown_ms, max_per_heat FROM rallycross WHERE id = 1
	`;

	// Get all active drivers not yet in any heat — they go at the bottom of standings
	const allActiveDrivers = await sql<
		{
			driver_id: number;
			driver_name: string;
			class_id: number;
			class_name: string;
			driver_uuid: string;
		}[]
	>`
		SELECT d.id AS driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
		       d.uuid::text AS driver_uuid
		FROM drivers d
		JOIN classes c ON c.id = d.class_id
		WHERE d.active = true
		ORDER BY c.start_priority DESC, d.name
	`;

	const allHeatResults = await fetchStartedHeatResults(cfg);
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
			best_lap_ms: null,
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
