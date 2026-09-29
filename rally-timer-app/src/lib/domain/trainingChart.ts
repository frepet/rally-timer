import type { TrainingDriverResult, TrainingLap } from './training';

export type TrainingChartSeries = {
	driver_id: number;
	driver_name: string;
	best_lap_ms: number;
	cutoff_ms: number | null;
	points: TrainingLap[];
	excluded_count: number;
};

export function buildTrainingChartSeries(
	drivers: TrainingDriverResult[],
	maxSlowerPercent: number | null
): TrainingChartSeries[] {
	const threshold =
		maxSlowerPercent === null || !Number.isFinite(maxSlowerPercent)
			? null
			: Math.max(0, maxSlowerPercent);

	return drivers.flatMap((driver) => {
		const validLaps = driver.laps.filter((lap) => lap.lap_ms > 0);
		if (validLaps.length === 0) return [];
		const bestLapMs = Math.min(...validLaps.map((lap) => lap.lap_ms));
		const cutoffMs = threshold === null ? null : bestLapMs * (1 + threshold / 100);
		const points = validLaps
			.filter((lap) => cutoffMs === null || lap.lap_ms <= cutoffMs)
			.sort((a, b) => a.timestamp - b.timestamp);

		return [
			{
				driver_id: driver.driver_id,
				driver_name: driver.driver_name,
				best_lap_ms: bestLapMs,
				cutoff_ms: cutoffMs,
				points,
				excluded_count: validLaps.length - points.length
			}
		];
	});
}
