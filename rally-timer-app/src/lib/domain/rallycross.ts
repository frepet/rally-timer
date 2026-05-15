import { positionToPoints } from './scoring';

// ---------------------------------------------------------------------------
// Shared input/output types
// ---------------------------------------------------------------------------

export type RallycrossDriverInput = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
	start_ms: number | null;
	passes: number[];
};

export type RallycrossDriverResult = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
	lap_count: number;
	last_lap_ms: number | null;
	best_lap_ms: number | null;
	total_ms: number | null;
	last_pass_ms: number | null;
	laps: number[];
};

// ---------------------------------------------------------------------------
// Heat-based types
// ---------------------------------------------------------------------------

export type HeatEntry = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
	ts_ms: number;
	dnf: boolean;
	dnf_time_ms: number | null;
	passes: number[];
	manual_position: number | null;
};

export type HeatResult = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
	heat_number: number;
	laps: number[];
	lap_count: number;
	total_ms: number | null;
	best_lap_ms: number | null;
	finished: boolean;
	dnf: boolean;
	dnf_time_ms: number | null;
	manual_position: number | null;
};

export type OverallResult = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	driver_uuid: string;
	total_points: number;
	best_total_ms: number | null;
	best_heat_number: number | null;
	heat_results: HeatResult[];
};

export type SubmissionRow = {
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	stage_name: string;
	elapsed_ms: number | null;
	dnf: boolean;
};

// ---------------------------------------------------------------------------
// Low-level helpers (unchanged)
// ---------------------------------------------------------------------------

export function filterByCooldown(passes: number[], cooldownMs: number): number[] {
	if (passes.length === 0) return [];
	const sorted = [...passes].sort((a, b) => a - b);
	const kept: number[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] - kept[kept.length - 1] >= cooldownMs) kept.push(sorted[i]);
	}
	return kept;
}

export function computeLaps(passes: number[], startedAt: number, cooldownMs: number): number[] {
	const valid = passes.filter((p) => p >= startedAt);
	const kept = filterByCooldown(valid, cooldownMs);
	if (kept.length === 0) return [];
	const laps: number[] = [kept[0] - startedAt];
	for (let i = 1; i < kept.length; i++) laps.push(kept[i] - kept[i - 1]);
	return laps;
}

// ---------------------------------------------------------------------------
// Legacy per-driver result (live leaderboard without heats)
// ---------------------------------------------------------------------------

export function computeDriverResult(
	driver: RallycrossDriverInput,
	cooldownMs: number
): RallycrossDriverResult {
	if (driver.start_ms === null) {
		return {
			driver_id: driver.driver_id,
			driver_name: driver.driver_name,
			class_id: driver.class_id,
			class_name: driver.class_name,
			tag: driver.tag,
			lap_count: 0,
			last_lap_ms: null,
			best_lap_ms: null,
			total_ms: null,
			last_pass_ms: null,
			laps: []
		};
	}
	const laps = computeLaps(driver.passes, driver.start_ms, cooldownMs);
	const best = laps.length ? Math.min(...laps) : null;
	const last = laps.length ? laps[laps.length - 1] : null;
	const total = laps.length ? laps.reduce((a, b) => a + b, 0) : null;
	const lastPass = laps.length ? driver.start_ms + (total ?? 0) : null;
	return {
		driver_id: driver.driver_id,
		driver_name: driver.driver_name,
		class_id: driver.class_id,
		class_name: driver.class_name,
		tag: driver.tag,
		lap_count: laps.length,
		last_lap_ms: last,
		best_lap_ms: best,
		total_ms: total,
		last_pass_ms: lastPass,
		laps
	};
}

export function buildRallycrossLeaderboard(
	drivers: RallycrossDriverInput[],
	cooldownMs: number
): RallycrossDriverResult[] {
	const results = drivers.map((d) => computeDriverResult(d, cooldownMs));
	return results.sort((a, b) => {
		const aBest = a.best_lap_ms;
		const bBest = b.best_lap_ms;
		if (aBest == null && bBest == null) return a.driver_name.localeCompare(b.driver_name);
		if (aBest == null) return 1;
		if (bBest == null) return -1;
		if (aBest !== bBest) return aBest - bBest;
		if (a.lap_count !== b.lap_count) return b.lap_count - a.lap_count;
		return a.driver_name.localeCompare(b.driver_name);
	});
}

// ---------------------------------------------------------------------------
// Heat-based domain
// ---------------------------------------------------------------------------

export function computeHeatResult(
	entry: HeatEntry,
	heatNumber: number,
	requiredLaps: number,
	cooldownMs: number
): HeatResult {
	if (entry.manual_position !== null) {
		return {
			driver_id: entry.driver_id,
			driver_name: entry.driver_name,
			class_id: entry.class_id,
			class_name: entry.class_name,
			tag: entry.tag,
			heat_number: heatNumber,
			laps: [],
			lap_count: 0,
			total_ms: null,
			best_lap_ms: null,
			finished: true,
			dnf: false,
			dnf_time_ms: null,
			manual_position: entry.manual_position
		};
	}
	const laps = computeLaps(entry.passes, entry.ts_ms, cooldownMs);
	const finished = laps.length >= requiredLaps;
	const total = finished ? laps.slice(0, requiredLaps).reduce((a, b) => a + b, 0) : null;
	const best = laps.length ? Math.min(...laps) : null;
	return {
		driver_id: entry.driver_id,
		driver_name: entry.driver_name,
		class_id: entry.class_id,
		class_name: entry.class_name,
		tag: entry.tag,
		heat_number: heatNumber,
		laps,
		lap_count: laps.length,
		total_ms: total,
		best_lap_ms: best,
		finished,
		dnf: entry.dnf,
		dnf_time_ms: entry.dnf_time_ms,
		manual_position: null
	};
}

export function computeDnfTime(
	results: Pick<HeatResult, 'total_ms' | 'finished'>[]
): number | null {
	const finisherTimes = results.filter((r) => r.finished && r.total_ms !== null).map((r) => r.total_ms as number);
	if (finisherTimes.length === 0) return null;
	return Math.max(...finisherTimes) + 30_000;
}

export function heatResultComparator(a: HeatResult, b: HeatResult): number {
	// 1. Finishers first
	if (a.finished && b.finished) {
		if (a.manual_position !== null && b.manual_position !== null)
			return a.manual_position - b.manual_position;
		return (a.total_ms ?? 0) - (b.total_ms ?? 0);
	}
	if (a.finished) return -1;
	if (b.finished) return 1;

	// 2. DNF by dnf_time_ms asc
	if (a.dnf && b.dnf) return (a.dnf_time_ms ?? 0) - (b.dnf_time_ms ?? 0);
	if (a.dnf) return -1;
	if (b.dnf) return 1;

	// 3. Unfinished by lap_count desc, then name
	if (a.lap_count !== b.lap_count) return b.lap_count - a.lap_count;
	return a.driver_name.localeCompare(b.driver_name);
}

export function buildHeatLeaderboard(
	entries: HeatEntry[],
	heatNumber: number,
	requiredLaps: number,
	cooldownMs: number
): HeatResult[] {
	const results = entries.map((e) => computeHeatResult(e, heatNumber, requiredLaps, cooldownMs));
	return results.sort(heatResultComparator);
}

/** Returns driver_id → points for one heat, ranked overall (all classes together). */
export function computeHeatPoints(heatResults: HeatResult[]): Map<number, number> {
	const sorted = [...heatResults].sort(heatResultComparator);
	const n = sorted.length;
	const points = new Map<number, number>();
	sorted.forEach((r, i) => points.set(r.driver_id, positionToPoints(i + 1, n)));
	return points;
}

export function buildOverallLeaderboard(allHeatResults: HeatResult[]): OverallResult[] {
	const map = new Map<number, OverallResult>();

	for (const r of allHeatResults) {
		if (!map.has(r.driver_id)) {
			map.set(r.driver_id, {
				driver_id: r.driver_id,
				driver_name: r.driver_name,
				class_id: r.class_id,
				class_name: r.class_name,
				driver_uuid: '',
				total_points: 0,
				best_total_ms: null,
				best_heat_number: null,
				heat_results: []
			});
		}
		const entry = map.get(r.driver_id)!;
		entry.heat_results.push(r);

		if (r.finished && r.total_ms !== null) {
			if (entry.best_total_ms === null || r.total_ms < entry.best_total_ms) {
				entry.best_total_ms = r.total_ms;
				entry.best_heat_number = r.heat_number;
			}
		}
	}

	// Accumulate per-class points across heats
	const byHeat = new Map<number, HeatResult[]>();
	for (const r of allHeatResults) {
		const bucket = byHeat.get(r.heat_number) ?? [];
		bucket.push(r);
		byHeat.set(r.heat_number, bucket);
	}
	for (const heatResults of byHeat.values()) {
		for (const [driverId, pts] of computeHeatPoints(heatResults)) {
			const entry = map.get(driverId);
			if (entry) entry.total_points += pts;
		}
	}

	return [...map.values()].sort((a, b) => {
		if (a.total_points !== b.total_points) return b.total_points - a.total_points;
		const aMs = a.best_total_ms;
		const bMs = b.best_total_ms;
		if (aMs !== null && bMs !== null) return aMs - bMs;
		if (aMs !== null) return -1;
		if (bMs !== null) return 1;
		return a.driver_name.localeCompare(b.driver_name);
	});
}

export function suggestNextHeatGroups(
	standings: Pick<OverallResult, 'driver_id' | 'class_name' | 'heat_results' | 'best_total_ms'>[],
	maxPerHeat: number
): number[][] {
	const sorted = [...standings].sort((a, b) => {
		if (a.class_name !== b.class_name) return a.class_name.localeCompare(b.class_name);
		if (a.heat_results.length !== b.heat_results.length)
			return a.heat_results.length - b.heat_results.length;
		if (a.best_total_ms === null && b.best_total_ms === null) return 0;
		if (a.best_total_ms === null) return 1;
		if (b.best_total_ms === null) return -1;
		return a.best_total_ms - b.best_total_ms;
	});
	const groups: number[][] = [];
	for (let i = 0; i < sorted.length; i += maxPerHeat) {
		groups.push(sorted.slice(i, i + maxPerHeat).map((s) => s.driver_id));
	}
	return groups;
}

// Converts per-heat results into championship submission rows — one row per
// driver per heat. elapsed_ms encodes finish position within the heat
// (1st = 1000ms, 2nd = 2000ms, …) so the championship ranks by heat points,
// not by raw lap time. Results must be pre-sorted by heatResultComparator
// within each heat (as buildHeatLeaderboard returns them).
export function buildRallycrossSubmission(
	heatResults: Array<HeatResult & { driver_uuid: string }>
): SubmissionRow[] {
	// Group by heat, preserving order (each group is already sorted by comparator)
	const byHeat = new Map<number, Array<HeatResult & { driver_uuid: string }>>();
	for (const r of heatResults) {
		const arr = byHeat.get(r.heat_number) ?? [];
		arr.push(r);
		byHeat.set(r.heat_number, arr);
	}

	const rows: SubmissionRow[] = [];
	for (const results of byHeat.values()) {
		results.forEach((r, i) => {
			rows.push({
				driver_uuid: r.driver_uuid,
				driver_name: r.driver_name,
				class_id: r.class_id,
				class_name: r.class_name,
				stage_name: `Rallycross heat ${r.heat_number}`,
				elapsed_ms: r.dnf ? null : (i + 1) * 1000,
				dnf: r.dnf
			});
		});
	}
	return rows;
}
