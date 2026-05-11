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
};

export type OverallResult = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	driver_uuid: string;
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
	elapsed_ms: number;
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
		dnf_time_ms: entry.dnf_time_ms
	};
}

export function computeDnfTime(
	results: Pick<HeatResult, 'total_ms' | 'finished'>[]
): number | null {
	const finisherTimes = results.filter((r) => r.finished && r.total_ms !== null).map((r) => r.total_ms as number);
	if (finisherTimes.length === 0) return null;
	return Math.max(...finisherTimes) + 30_000;
}

export function buildHeatLeaderboard(
	entries: HeatEntry[],
	heatNumber: number,
	requiredLaps: number,
	cooldownMs: number
): HeatResult[] {
	const results = entries.map((e) => computeHeatResult(e, heatNumber, requiredLaps, cooldownMs));
	return results.sort((a, b) => {
		const aFinished = a.finished;
		const bFinished = b.finished;
		const aDnf = a.dnf;
		const bDnf = b.dnf;

		// 1. Finishers first (by total_ms asc)
		if (aFinished && bFinished) return (a.total_ms ?? 0) - (b.total_ms ?? 0);
		if (aFinished) return -1;
		if (bFinished) return 1;

		// 2. DNF entries (by dnf_time_ms asc)
		if (aDnf && bDnf) return (a.dnf_time_ms ?? 0) - (b.dnf_time_ms ?? 0);
		if (aDnf) return -1;
		if (bDnf) return 1;

		// 3. Unfinished (by lap_count desc, then name)
		if (a.lap_count !== b.lap_count) return b.lap_count - a.lap_count;
		return a.driver_name.localeCompare(b.driver_name);
	});
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

	return [...map.values()].sort((a, b) => {
		const aMs = a.best_total_ms;
		const bMs = b.best_total_ms;
		if (aMs !== null && bMs !== null) return aMs - bMs;
		if (aMs !== null) return -1;
		if (bMs !== null) return 1;
		// Both unfinished — sort by most laps in any heat
		const aLaps = Math.max(0, ...a.heat_results.map((r) => r.lap_count));
		const bLaps = Math.max(0, ...b.heat_results.map((r) => r.lap_count));
		if (aLaps !== bLaps) return bLaps - aLaps;
		return a.driver_name.localeCompare(b.driver_name);
	});
}

export function suggestNextHeatGroups(
	standings: Pick<OverallResult, 'driver_id'>[],
	maxPerHeat: number
): number[][] {
	const groups: number[][] = [];
	for (let i = 0; i < standings.length; i += maxPerHeat) {
		groups.push(standings.slice(i, i + maxPerHeat).map((s) => s.driver_id));
	}
	return groups;
}

export function buildRallycrossSubmission(
	overallResults: OverallResult[]
): SubmissionRow[] {
	return overallResults
		.filter((r) => r.best_total_ms !== null && r.best_heat_number !== null)
		.map((r) => ({
			driver_uuid: r.driver_uuid,
			driver_name: r.driver_name,
			class_id: r.class_id,
			class_name: r.class_name,
			stage_name: `Rallycross heat ${r.best_heat_number}`,
			elapsed_ms: r.best_total_ms as number,
			dnf: false
		}));
}
