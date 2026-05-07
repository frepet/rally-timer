export type RallycrossDriverInput = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
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

export function computeDriverResult(
	driver: RallycrossDriverInput,
	startedAt: number,
	cooldownMs: number
): RallycrossDriverResult {
	const laps = computeLaps(driver.passes, startedAt, cooldownMs);
	const best = laps.length ? Math.min(...laps) : null;
	const last = laps.length ? laps[laps.length - 1] : null;
	const total = laps.length ? laps.reduce((a, b) => a + b, 0) : null;
	const lastPass = laps.length ? startedAt + (total ?? 0) : null;
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
	startedAt: number,
	cooldownMs: number
): RallycrossDriverResult[] {
	const results = drivers.map((d) => computeDriverResult(d, startedAt, cooldownMs));
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
