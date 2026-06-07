export type TrainingPass = {
	gate_event_id: number;
	timestamp: number;
	rssi: number | null;
};

export type TrainingLap = {
	gate_event_id: number;
	timestamp: number;
	lap_ms: number;
	rssi: number | null;
};

export type TrainingDriverInput = {
	driver_id: number;
	driver_name: string;
	class_id: number | null;
	class_name: string | null;
	tag: string;
	passes: TrainingPass[];
};

export type TrainingDriverResult = {
	driver_id: number;
	driver_name: string;
	class_id: number | null;
	class_name: string | null;
	tag: string;
	lap_count: number;
	best_lap_ms: number | null;
	median_lap_ms: number | null;
	last_lap_ms: number | null;
	last_pass_ms: number | null;
	laps: TrainingLap[];
};

// Filters passes by cooldown, keeping the first pass and dropping any
// subsequent pass that falls within cooldownMs of the previously kept one.
export function filterPassesByCooldown(passes: TrainingPass[], cooldownMs: number): TrainingPass[] {
	if (passes.length === 0) return [];
	const sorted = [...passes].sort((a, b) => a.timestamp - b.timestamp);
	const kept: TrainingPass[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].timestamp - kept[kept.length - 1].timestamp >= cooldownMs) {
			kept.push(sorted[i]);
		}
	}
	return kept;
}

// Computes laps from a list of passes at a single gate. The first surviving
// pass starts the clock; each subsequent pass yields one lap (delta to the
// previous pass). Each lap is attributed to the pass that *ended* it, so
// deleting that gate_event removes that specific lap.
export function computeTrainingLaps(passes: TrainingPass[], cooldownMs: number): TrainingLap[] {
	const kept = filterPassesByCooldown(passes, cooldownMs);
	if (kept.length < 2) return [];
	const laps: TrainingLap[] = [];
	for (let i = 1; i < kept.length; i++) {
		laps.push({
			gate_event_id: kept[i].gate_event_id,
			timestamp: kept[i].timestamp,
			lap_ms: kept[i].timestamp - kept[i - 1].timestamp,
			rssi: kept[i].rssi
		});
	}
	return laps;
}

export function medianOf(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid];
	return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeTrainingDriverResult(
	driver: TrainingDriverInput,
	cooldownMs: number
): TrainingDriverResult {
	const laps = computeTrainingLaps(driver.passes, cooldownMs);
	const lapTimes = laps.map((l) => l.lap_ms);
	const lastPass = driver.passes.length ? Math.max(...driver.passes.map((p) => p.timestamp)) : null;
	return {
		driver_id: driver.driver_id,
		driver_name: driver.driver_name,
		class_id: driver.class_id,
		class_name: driver.class_name,
		tag: driver.tag,
		lap_count: laps.length,
		best_lap_ms: lapTimes.length ? Math.min(...lapTimes) : null,
		median_lap_ms: medianOf(lapTimes),
		last_lap_ms: lapTimes.length ? lapTimes[lapTimes.length - 1] : null,
		last_pass_ms: lastPass,
		laps
	};
}

export function buildTrainingLeaderboard(
	drivers: TrainingDriverInput[],
	cooldownMs: number
): TrainingDriverResult[] {
	const results = drivers.map((d) => computeTrainingDriverResult(d, cooldownMs));
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
