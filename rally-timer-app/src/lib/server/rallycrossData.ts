import { sql } from './db';
import { buildHeatLeaderboard, type HeatEntry, type HeatResult } from '../domain/rallycross';

type HeatRow = {
	id: number;
	number: number;
	required_laps: number;
	started_at: number | null;
	closed_at: number | null;
};

type Cfg = { gate_id: string | null; cooldown_ms: number };

async function fetchEntriesForHeat(
	heat: HeatRow,
	cfg: Cfg
): Promise<Array<HeatEntry & { driver_uuid: string }>> {
	const isManual = heat.started_at === null;
	const upperTs = heat.closed_at ?? Number.MAX_SAFE_INTEGER;

	const rows = await sql<
		{
			driver_id: number;
			driver_name: string;
			class_id: number;
			class_name: string;
			driver_uuid: string;
			tag: string;
			ts_ms: number | null;
			dnf: boolean;
			dnf_time_ms: number | null;
			manual_position: number | null;
		}[]
	>`
		SELECT rhe.driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
		       d.uuid::text AS driver_uuid, d.tag, rhe.ts_ms, rhe.dnf, rhe.dnf_time_ms,
		       rhe.manual_position
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id  = rhe.driver_id
		JOIN classes c ON c.id  = d.class_id
		WHERE rhe.heat_id = ${heat.id}
	`;

	return Promise.all(
		rows.map(async (e) => {
			const ts = Number(e.ts_ms ?? 0);
			const passes =
				!isManual && cfg.gate_id && e.ts_ms
					? await sql<{ timestamp: number }[]>`
							SELECT timestamp FROM gate_events
							WHERE gate_id = ${cfg.gate_id!} AND tag = ${e.tag}
							  AND timestamp >= ${ts}
							  AND timestamp <= ${upperTs}
							ORDER BY timestamp
						`
					: [];
			return {
				driver_id: e.driver_id,
				driver_name: e.driver_name,
				class_id: e.class_id,
				class_name: e.class_name,
				driver_uuid: e.driver_uuid,
				tag: e.tag,
				ts_ms: ts,
				dnf: e.dnf,
				dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null,
				passes: passes.map((p) => Number(p.timestamp)),
				manual_position: e.manual_position !== null ? Number(e.manual_position) : null
			};
		})
	);
}

function toHeatResultsWithUuid(
	entries: Array<HeatEntry & { driver_uuid: string }>,
	heat: HeatRow,
	cooldownMs: number
): Array<HeatResult & { driver_uuid: string }> {
	const uuidMap = new Map(entries.map((e) => [e.driver_id, e.driver_uuid]));
	return buildHeatLeaderboard(entries, heat.number, heat.required_laps, cooldownMs).map((r) => ({
		...r,
		driver_uuid: uuidMap.get(r.driver_id) ?? ''
	}));
}

/** Fetches results for all closed heats (gate events bounded by closed_at). */
export async function fetchClosedHeatResults(
	cfg: Cfg
): Promise<Array<HeatResult & { driver_uuid: string }>> {
	const heats = await sql<HeatRow[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats WHERE closed_at IS NOT NULL ORDER BY number
	`;
	return (
		await Promise.all(
			heats.map(async (heat) => {
				const entries = await fetchEntriesForHeat(heat, cfg);
				return toHeatResultsWithUuid(entries, heat, cfg.cooldown_ms);
			})
		)
	).flat();
}

/** Fetches results for all started heats (including live; gate events unbounded above). */
export async function fetchStartedHeatResults(
	cfg: Cfg
): Promise<Array<HeatResult & { driver_uuid: string }>> {
	const heats = await sql<HeatRow[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats WHERE started_at IS NOT NULL ORDER BY number
	`;
	return (
		await Promise.all(
			heats.map(async (heat) => {
				const entries = await fetchEntriesForHeat(heat, cfg);
				return toHeatResultsWithUuid(entries, heat, cfg.cooldown_ms);
			})
		)
	).flat();
}
