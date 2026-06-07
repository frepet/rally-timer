import { describe, it, expect } from 'vitest';
import {
	buildTrainingLeaderboard,
	computeTrainingDriverResult,
	computeTrainingLaps,
	filterPassesByCooldown,
	medianOf,
	type TrainingPass
} from './training';

const pass = (id: number, timestamp: number): TrainingPass => ({ gate_event_id: id, timestamp, rssi: null });

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
