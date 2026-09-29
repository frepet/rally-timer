import { describe, expect, it } from 'vitest';
import type { TrainingDriverResult, TrainingLap } from './training';
import {
	buildTrackDevelopment,
	buildTrainingChartSeries,
	rollingRacePace,
	segmentRacePace
} from './trainingChart';

const lap = (id: number, timestamp: number, lap_ms: number): TrainingLap => ({
	gate_event_id: id,
	timestamp,
	lap_ms,
	rssi: null
});

const driver = (
	driver_id: number,
	driver_name: string,
	laps: TrainingLap[]
): TrainingDriverResult => ({
	driver_id,
	driver_name,
	class_id: null,
	class_name: null,
	tag: String(driver_id),
	lap_count: laps.length,
	best_lap_ms: Math.min(...laps.map((entry) => entry.lap_ms)),
	median_lap_ms: null,
	last_lap_ms: laps.at(-1)?.lap_ms ?? null,
	last_pass_ms: laps.at(-1)?.timestamp ?? null,
	laps
});

describe('training chart series', () => {
	it('calculates race pace as a six-lap rolling average', () => {
		const pace = rollingRacePace([
			lap(1, 1000, 1000),
			lap(2, 2000, 1100),
			lap(3, 3000, 1200),
			lap(4, 4000, 1300),
			lap(5, 5000, 1400),
			lap(6, 6000, 1500),
			lap(7, 7000, 2200)
		]);

		expect(pace.map((point) => point.pace_ms)).toEqual([1000, 1050, 1100, 1150, 1200, 1250, 1450]);
		expect(pace.map((point) => point.sample_count)).toEqual([1, 2, 3, 4, 5, 6, 6]);
	});

	it('breaks the race pace line after three minutes without a lap', () => {
		const pace = rollingRacePace([
			lap(1, 1000, 1000),
			lap(2, 181_000, 1100),
			lap(3, 361_001, 1200),
			lap(4, 370_000, 1300)
		]);

		expect(segmentRacePace(pace).map((segment) => segment.map((point) => point.timestamp))).toEqual(
			[
				[1000, 181_000],
				[361_001, 370_000]
			]
		);
	});

	it('averages the five fastest laps in each 15-minute interval', () => {
		const interval = 15 * 60_000;
		const series = buildTrainingChartSeries(
			[
				driver(1, 'Anna', [
					lap(1, 1000, 1000),
					lap(2, 2000, 1100),
					lap(3, 3000, 1200),
					lap(4, 4000, 1300),
					lap(5, 5000, 1400),
					lap(6, 6000, 5000),
					lap(7, interval + 1000, 1500),
					lap(8, interval * 2 + 1000, 2000)
				])
			],
			50
		);

		const development = buildTrackDevelopment(series);
		expect(development.map((entry) => entry.average_lap_ms)).toEqual([1200, 1500, 2000]);
		expect(development.map((entry) => entry.sample_count)).toEqual([5, 1, 1]);
		expect(development.map((entry) => entry.intensity)).toEqual([0, 0.375, 1]);
	});

	it('keeps empty 15-minute intervals in the track development timeline', () => {
		const interval = 15 * 60_000;
		const series = buildTrainingChartSeries(
			[driver(1, 'Anna', [lap(1, 1000, 1000), lap(2, interval * 2 + 1000, 1100)])],
			null
		);

		const development = buildTrackDevelopment(series);
		expect(development.map((entry) => entry.average_lap_ms)).toEqual([1000, null, 1100]);
		expect(development[1].intensity).toBeNull();
	});

	it('orders points by wall-clock finish time rather than input lap order', () => {
		const [series] = buildTrainingChartSeries(
			[driver(1, 'Anna', [lap(2, 3000, 1100), lap(1, 1000, 1000)])],
			50
		);
		expect(series.points.map((point) => point.timestamp)).toEqual([1000, 3000]);
	});

	it('filters each driver relative to their own best lap', () => {
		const series = buildTrainingChartSeries(
			[
				driver(1, 'Anna', [lap(1, 1000, 1000), lap(2, 2000, 1600)]),
				driver(2, 'Bo', [lap(3, 1000, 2000), lap(4, 2000, 2900), lap(5, 3000, 3100)])
			],
			50
		);
		expect(series[0].points.map((point) => point.lap_ms)).toEqual([1000]);
		expect(series[1].points.map((point) => point.lap_ms)).toEqual([2000, 2900]);
		expect(series.map((entry) => entry.excluded_count)).toEqual([1, 1]);
	});

	it('excludes slow laps from race pace when filtering is enabled', () => {
		const [series] = buildTrainingChartSeries(
			[
				driver(1, 'Anna', [
					lap(1, 1000, 1000),
					lap(2, 2000, 1100),
					lap(3, 3000, 5000),
					lap(4, 4000, 1200)
				])
			],
			50
		);

		expect(series.pace_points.map((point) => point.pace_ms)).toEqual([1000, 1050, 1100]);
		expect(series.current_pace_ms).toBe(1100);
	});

	it('includes a lap exactly fifty percent slower than the best', () => {
		const [series] = buildTrainingChartSeries(
			[driver(1, 'Anna', [lap(1, 1000, 1000), lap(2, 2000, 1500)])],
			50
		);
		expect(series.points).toHaveLength(2);
	});

	it('can disable the slow-lap filter', () => {
		const [series] = buildTrainingChartSeries(
			[driver(1, 'Anna', [lap(1, 1000, 1000), lap(2, 2000, 5000)])],
			null
		);
		expect(series.points).toHaveLength(2);
		expect(series.cutoff_ms).toBeNull();
		expect(series.excluded_count).toBe(0);
	});
});
