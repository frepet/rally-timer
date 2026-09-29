import { describe, expect, it } from 'vitest';
import type { TrainingDriverResult, TrainingLap } from './training';
import { buildTrainingChartSeries } from './trainingChart';

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
