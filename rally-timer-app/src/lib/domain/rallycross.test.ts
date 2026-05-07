import { describe, it, expect } from 'vitest';
import {
	buildRallycrossLeaderboard,
	computeDriverResult,
	computeLaps,
	filterByCooldown
} from './rallycross';

describe('filterByCooldown', () => {
	it('returns empty when no passes', () => {
		expect(filterByCooldown([], 1000)).toEqual([]);
	});

	it('keeps the first pass and drops anything within cooldown', () => {
		expect(filterByCooldown([1000, 1500, 1900, 3000], 1000)).toEqual([1000, 3000]);
	});

	it('does not drop passes exactly at the cooldown boundary', () => {
		expect(filterByCooldown([1000, 2000], 1000)).toEqual([1000, 2000]);
	});

	it('sorts unsorted input', () => {
		expect(filterByCooldown([3000, 1000, 2500], 1000)).toEqual([1000, 2500]);
	});
});

describe('computeLaps', () => {
	it('returns empty when no passes after start', () => {
		expect(computeLaps([100, 500], 1000, 1000)).toEqual([]);
	});

	it('lap 1 = first pass - startedAt; lap N = pass N - pass N-1', () => {
		expect(computeLaps([1500, 3000, 4500], 1000, 1000)).toEqual([500, 1500, 1500]);
	});

	it('drops double-blip passes via cooldown', () => {
		// 1100 is within 1000ms of 1050, so it's dropped
		expect(computeLaps([1050, 1100, 3000], 1000, 1000)).toEqual([50, 1950]);
	});

	it('ignores passes before startedAt', () => {
		expect(computeLaps([500, 900, 1500, 3000], 1000, 1000)).toEqual([500, 1500]);
	});
});

describe('computeDriverResult', () => {
	const driver = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		passes: [1500, 3000, 4500]
	};

	it('summarises laps', () => {
		const r = computeDriverResult(driver, 1000, 1000);
		expect(r.lap_count).toBe(3);
		expect(r.laps).toEqual([500, 1500, 1500]);
		expect(r.best_lap_ms).toBe(500);
		expect(r.last_lap_ms).toBe(1500);
		expect(r.total_ms).toBe(3500);
		expect(r.last_pass_ms).toBe(4500);
	});

	it('returns nulls when no laps', () => {
		const r = computeDriverResult({ ...driver, passes: [] }, 1000, 1000);
		expect(r.lap_count).toBe(0);
		expect(r.best_lap_ms).toBeNull();
		expect(r.last_lap_ms).toBeNull();
		expect(r.total_ms).toBeNull();
		expect(r.last_pass_ms).toBeNull();
	});
});

describe('buildRallycrossLeaderboard', () => {
	it('sorts by best lap ascending; drivers without laps sink to bottom', () => {
		const drivers = [
			{
				driver_id: 1,
				driver_name: 'Slow',
				class_id: 1,
				class_name: 'A',
				tag: 'S',
				passes: [3000, 5000]
			},
			{
				driver_id: 2,
				driver_name: 'Fast',
				class_id: 1,
				class_name: 'A',
				tag: 'F',
				passes: [1500, 2500]
			},
			{
				driver_id: 3,
				driver_name: 'NoShow',
				class_id: 1,
				class_name: 'A',
				tag: 'N',
				passes: []
			}
		];
		const board = buildRallycrossLeaderboard(drivers, 1000, 500);
		expect(board.map((r) => r.driver_name)).toEqual(['Fast', 'Slow', 'NoShow']);
		expect(board[0].best_lap_ms).toBe(500);
	});

	it('breaks ties on more laps then name', () => {
		const drivers = [
			{
				driver_id: 1,
				driver_name: 'Bob',
				class_id: 1,
				class_name: 'A',
				tag: 'B',
				passes: [2000]
			},
			{
				driver_id: 2,
				driver_name: 'Alice',
				class_id: 1,
				class_name: 'A',
				tag: 'A',
				passes: [2000, 3000]
			}
		];
		const board = buildRallycrossLeaderboard(drivers, 1000, 500);
		// Both have best lap 1000, but Alice has 2 laps so she ranks first.
		expect(board[0].driver_name).toBe('Alice');
	});
});
