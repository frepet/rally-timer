import { describe, it, expect } from 'vitest';
import {
	bestLapNumber,
	buildTrainingLeaderboard,
	computeTrainingDriverResult,
	computeTrainingLaps,
	filterPassesByCooldown,
	medianOf,
	type TrainingPass
} from './training';

const pass = (id: number, timestamp: number): TrainingPass => ({
	gate_event_id: id,
	timestamp,
	rssi: null
});

describe('filterPassesByCooldown', () => {
	it('returns empty when no passes', () => {
		expect(filterPassesByCooldown([], 1000)).toEqual([]);
	});

	it('keeps the first pass and drops within-cooldown passes', () => {
		const out = filterPassesByCooldown([pass(1, 1000), pass(2, 1500), pass(3, 3000)], 1000);
		expect(out.map((p) => p.gate_event_id)).toEqual([1, 3]);
	});

	it('keeps passes exactly at the cooldown boundary', () => {
		const out = filterPassesByCooldown([pass(1, 1000), pass(2, 2000)], 1000);
		expect(out.map((p) => p.gate_event_id)).toEqual([1, 2]);
	});

	it('sorts unsorted input', () => {
		const out = filterPassesByCooldown([pass(3, 3000), pass(1, 1000), pass(2, 2500)], 1000);
		expect(out.map((p) => p.gate_event_id)).toEqual([1, 2]);
	});
});

describe('computeTrainingLaps', () => {
	it('returns empty when only one pass (just starts the clock)', () => {
		expect(computeTrainingLaps([pass(1, 1000)], 1000)).toEqual([]);
	});

	it('returns one lap per consecutive pass after the first', () => {
		const laps = computeTrainingLaps([pass(1, 1000), pass(2, 2500), pass(3, 4000)], 1000);
		expect(laps).toEqual([
			{ gate_event_id: 2, timestamp: 2500, lap_ms: 1500, rssi: null },
			{ gate_event_id: 3, timestamp: 4000, lap_ms: 1500, rssi: null }
		]);
	});

	it('attributes each lap to the ending gate_event so deletion is unambiguous', () => {
		const laps = computeTrainingLaps([pass(10, 1000), pass(11, 3000)], 1000);
		expect(laps[0].gate_event_id).toBe(11);
	});

	it('drops double-blip passes via cooldown', () => {
		const laps = computeTrainingLaps([pass(1, 1000), pass(2, 1100), pass(3, 3000)], 1000);
		expect(laps.map((l) => l.lap_ms)).toEqual([2000]);
	});
});

describe('medianOf', () => {
	it('returns null for empty array', () => {
		expect(medianOf([])).toBeNull();
	});

	it('returns the single value for length 1', () => {
		expect(medianOf([42])).toBe(42);
	});

	it('returns the middle for odd length', () => {
		expect(medianOf([3, 1, 2])).toBe(2);
	});

	it('returns the rounded mean of the two middle values for even length', () => {
		expect(medianOf([1, 2, 3, 4])).toBe(3);
		expect(medianOf([1, 2])).toBe(2);
	});
});

describe('computeTrainingDriverResult', () => {
	const driver = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'A',
		tag: 'A1',
		passes: [pass(1, 1000), pass(2, 2500), pass(3, 4000), pass(4, 7000)]
	};

	it('summarises laps, best, median, last', () => {
		const r = computeTrainingDriverResult(driver, 1000);
		expect(r.lap_count).toBe(3);
		expect(r.laps.map((l) => l.lap_ms)).toEqual([1500, 1500, 3000]);
		expect(r.best_lap_ms).toBe(1500);
		expect(r.median_lap_ms).toBe(1500);
		expect(r.last_lap_ms).toBe(3000);
		expect(r.last_pass_ms).toBe(7000);
	});

	it('returns nulls when only one pass is recorded', () => {
		const r = computeTrainingDriverResult({ ...driver, passes: [pass(1, 1000)] }, 1000);
		expect(r.lap_count).toBe(0);
		expect(r.best_lap_ms).toBeNull();
		expect(r.median_lap_ms).toBeNull();
		expect(r.last_lap_ms).toBeNull();
		expect(r.last_pass_ms).toBe(1000);
	});

	it('returns all-null stats when no passes', () => {
		const r = computeTrainingDriverResult({ ...driver, passes: [] }, 1000);
		expect(r.lap_count).toBe(0);
		expect(r.last_pass_ms).toBeNull();
	});
});

describe('buildTrainingLeaderboard', () => {
	it('ranks drivers by best lap, then lap count, then name', () => {
		const drivers = [
			{
				driver_id: 1,
				driver_name: 'Anna',
				class_id: 1,
				class_name: 'A',
				tag: 'A1',
				passes: [pass(1, 1000), pass(2, 3000)] // 2000ms
			},
			{
				driver_id: 2,
				driver_name: 'Bo',
				class_id: 1,
				class_name: 'A',
				tag: 'B1',
				passes: [pass(3, 1000), pass(4, 2500), pass(5, 4000)] // 1500ms, 1500ms
			},
			{
				driver_id: 3,
				driver_name: 'Cecilia',
				class_id: 1,
				class_name: 'A',
				tag: 'C1',
				passes: [pass(6, 1000)] // no laps
			}
		];
		const board = buildTrainingLeaderboard(drivers, 1000);
		expect(board.map((d) => d.driver_name)).toEqual(['Bo', 'Anna', 'Cecilia']);
	});
});

describe('buildTrainingLeaderboard rssi deltas', () => {
	const rp = (id: number, timestamp: number, rssi: number | null): TrainingPass => ({
		gate_event_id: id,
		timestamp,
		rssi
	});
	const driver = (id: number, passes: TrainingPass[]) => ({
		driver_id: id,
		driver_name: `D${id}`,
		class_id: null,
		class_name: null,
		tag: `T${id}`,
		passes
	});

	it("compares each lap with the mean of every driver's passes in the event", () => {
		// Passes: -60, -70 (D1) and -65, -76 (D2): mean -67.75.
		const board = buildTrainingLeaderboard(
			[
				driver(1, [rp(1, 0, -60), rp(2, 10000, -70)]),
				driver(2, [rp(3, 0, -65), rp(4, 12000, -76)])
			],
			1000
		);
		const lap = (name: string) => board.find((d) => d.driver_name === name)!.laps[0];
		expect(lap('D1').rssi_delta).toBe(-2); // -70 vs -67.75
		expect(lap('D2').rssi_delta).toBe(-8); // -76 vs -67.75
	});

	it('only counts passes that survive the cooldown', () => {
		const board = buildTrainingLeaderboard(
			[
				driver(1, [rp(1, 0, -60), rp(2, 100, -20), rp(3, 10000, -60)]),
				driver(2, [rp(4, 0, -60), rp(5, 10000, -60)])
			],
			1000
		);
		// -20 is inside the cooldown, so the mean stays -60 and the deltas are 0.
		expect(board.flatMap((d) => d.laps.map((l) => l.rssi_delta))).toEqual([0, 0]);
	});

	it('gives no delta when the event has too few reads', () => {
		const board = buildTrainingLeaderboard([driver(1, [rp(1, 0, -60), rp(2, 10000, -70)])], 1000);
		expect(board[0].laps[0].rssi_delta).toBeNull();
	});
});

describe('bestLapNumber', () => {
	const lap = (id: number, lapMs: number) => ({
		gate_event_id: id,
		timestamp: id * 1000,
		lap_ms: lapMs,
		rssi: null
	});

	it('returns the 1-based number of the best lap', () => {
		expect(bestLapNumber([lap(1, 3000), lap(2, 1500), lap(3, 2000)], 1500)).toBe(2);
	});

	it('returns the first lap when the best time is tied', () => {
		expect(bestLapNumber([lap(1, 3000), lap(2, 1500), lap(3, 1500)], 1500)).toBe(2);
	});

	it('returns null without laps or best time', () => {
		expect(bestLapNumber([], null)).toBeNull();
		expect(bestLapNumber([lap(1, 3000)], null)).toBeNull();
	});
});
