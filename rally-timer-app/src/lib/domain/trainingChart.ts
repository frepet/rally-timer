import type { TrainingDriverResult, TrainingLap } from './training';

export type TrainingChartSeries = {
	driver_id: number;
	driver_name: string;
	best_lap_ms: number;
	cutoff_ms: number | null;
	all_points: TrainingLap[];
	points: TrainingLap[];
	pace_points: TrainingPacePoint[];
	pace_segments: TrainingPacePoint[][];
	current_pace_ms: number;
	excluded_count: number;
};

export type TrainingPacePoint = {
	timestamp: number;
	pace_ms: number;
	sample_count: number;
};

export type TrackDevelopmentInterval = {
	start_timestamp: number;
	end_timestamp: number;
	average_lap_ms: number | null;
	sample_count: number;
	intensity: number | null;
};

export const RACE_PACE_WINDOW = 6;
export const RACE_PACE_MAX_GAP_MS = 3 * 60_000;
export const TRACK_DEVELOPMENT_INTERVAL_MS = 15 * 60_000;
export const TRACK_DEVELOPMENT_FASTEST_LAPS = 5;

export type TrackDevelopmentOptions = {
	startTimestamp?: number;
	endTimestamp?: number;
};

export function rollingRacePace(
	laps: TrainingLap[],
	windowSize = RACE_PACE_WINDOW
): TrainingPacePoint[] {
	const size = Math.max(1, Math.floor(windowSize));
	return laps.map((lap, index) => {
		const window = laps.slice(Math.max(0, index - size + 1), index + 1);
		return {
			timestamp: lap.timestamp,
			pace_ms: Math.round(window.reduce((sum, entry) => sum + entry.lap_ms, 0) / window.length),
			sample_count: window.length
		};
	});
}

export function segmentRacePace(
	points: TrainingPacePoint[],
	maxGapMs = RACE_PACE_MAX_GAP_MS
): TrainingPacePoint[][] {
	if (points.length === 0) return [];
	const segments: TrainingPacePoint[][] = [[points[0]]];
	for (const point of points.slice(1)) {
		const current = segments[segments.length - 1];
		if (point.timestamp - current[current.length - 1].timestamp > maxGapMs) {
			segments.push([point]);
		} else {
			current.push(point);
		}
	}
	return segments;
}

export function buildTrackDevelopment(
	series: TrainingChartSeries[],
	options: TrackDevelopmentOptions = {}
): TrackDevelopmentInterval[] {
	const laps = series.flatMap((entry) => entry.all_points);
	if (
		laps.length === 0 &&
		(options.startTimestamp === undefined || options.endTimestamp === undefined)
	) {
		return [];
	}

	const duration = TRACK_DEVELOPMENT_INTERVAL_MS;
	const count = TRACK_DEVELOPMENT_FASTEST_LAPS;
	const firstStart =
		options.startTimestamp ??
		Math.floor(Math.min(...laps.map((lap) => lap.timestamp)) / duration) * duration;
	const lastStart =
		options.endTimestamp === undefined
			? Math.floor(Math.max(...laps.map((lap) => lap.timestamp)) / duration) * duration
			: options.endTimestamp - duration;
	const lapsByInterval = new Map<number, number[]>();

	for (const lap of laps) {
		const start = Math.floor(lap.timestamp / duration) * duration;
		const values = lapsByInterval.get(start) ?? [];
		values.push(lap.lap_ms);
		lapsByInterval.set(start, values);
	}

	const intervals: TrackDevelopmentInterval[] = [];
	for (let start = firstStart; start <= lastStart; start += duration) {
		const fastest = (lapsByInterval.get(start) ?? []).sort((a, b) => a - b).slice(0, count);
		intervals.push({
			start_timestamp: start,
			end_timestamp: start + duration,
			average_lap_ms:
				fastest.length === 0
					? null
					: Math.round(fastest.reduce((sum, lapMs) => sum + lapMs, 0) / fastest.length),
			sample_count: fastest.length,
			intensity: null
		});
	}

	const averages = intervals.flatMap((interval) =>
		interval.average_lap_ms === null ? [] : [interval.average_lap_ms]
	);
	const fastestAverage = Math.min(...averages);
	const slowestAverage = Math.max(...averages);
	return intervals.map((interval) => ({
		...interval,
		intensity:
			interval.average_lap_ms === null
				? null
				: fastestAverage === slowestAverage
					? 0.5
					: (interval.average_lap_ms - fastestAverage) / (slowestAverage - fastestAverage)
	}));
}

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
		const allPoints = [...validLaps].sort((a, b) => a.timestamp - b.timestamp);
		const points = allPoints.filter((lap) => cutoffMs === null || lap.lap_ms <= cutoffMs);
		const pacePoints = rollingRacePace(points);

		return [
			{
				driver_id: driver.driver_id,
				driver_name: driver.driver_name,
				best_lap_ms: bestLapMs,
				cutoff_ms: cutoffMs,
				all_points: allPoints,
				points,
				pace_points: pacePoints,
				pace_segments: segmentRacePace(pacePoints),
				current_pace_ms: pacePoints.at(-1)?.pace_ms ?? bestLapMs,
				excluded_count: validLaps.length - points.length
			}
		];
	});
}
