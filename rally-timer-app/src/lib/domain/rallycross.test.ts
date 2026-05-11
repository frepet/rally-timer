import { describe, it, expect } from 'vitest';
import {
	buildRallycrossLeaderboard,
	computeDriverResult,
	computeHeatResult,
	computeLaps,
	filterByCooldown,
	computeDnfTime,
	buildHeatLeaderboard,
	buildOverallLeaderboard,
	suggestNextHeatGroups,
	buildRallycrossSubmission
} from './rallycross';

// ---------------------------------------------------------------------------
// Unchanged low-level helpers
// ---------------------------------------------------------------------------

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
		expect(computeLaps([1050, 1100, 3000], 1000, 1000)).toEqual([50, 1950]);
	});

	it('ignores passes before startedAt', () => {
		expect(computeLaps([500, 900, 1500, 3000], 1000, 1000)).toEqual([500, 1500]);
	});
});

// ---------------------------------------------------------------------------
// Legacy per-driver result (uses per-driver start_ms field)
// ---------------------------------------------------------------------------

describe('computeDriverResult (legacy leaderboard)', () => {
	const driver = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		start_ms: 1000,
		passes: [1500, 3000, 4500]
	};

	it('summarises laps using driver.start_ms', () => {
		const r = computeDriverResult(driver, 1000);
		expect(r.lap_count).toBe(3);
		expect(r.laps).toEqual([500, 1500, 1500]);
		expect(r.best_lap_ms).toBe(500);
		expect(r.last_lap_ms).toBe(1500);
		expect(r.total_ms).toBe(3500);
		expect(r.last_pass_ms).toBe(4500);
	});

	it('returns nulls when no laps', () => {
		const r = computeDriverResult({ ...driver, passes: [] }, 1000);
		expect(r.lap_count).toBe(0);
		expect(r.best_lap_ms).toBeNull();
		expect(r.last_lap_ms).toBeNull();
		expect(r.total_ms).toBeNull();
		expect(r.last_pass_ms).toBeNull();
	});

	it('returns nulls when start_ms is null (driver not yet started)', () => {
		const r = computeDriverResult({ ...driver, start_ms: null }, 1000);
		expect(r.lap_count).toBe(0);
		expect(r.best_lap_ms).toBeNull();
	});
});

describe('buildRallycrossLeaderboard', () => {
	it('sorts by best lap ascending; drivers without laps sink to bottom', () => {
		const drivers = [
			{ driver_id: 1, driver_name: 'Slow', class_id: 1, class_name: 'A', tag: 'S', start_ms: 1000, passes: [3000, 5000] },
			{ driver_id: 2, driver_name: 'Fast', class_id: 1, class_name: 'A', tag: 'F', start_ms: 1000, passes: [1500, 2500] },
			{ driver_id: 3, driver_name: 'NoShow', class_id: 1, class_name: 'A', tag: 'N', start_ms: null, passes: [] }
		];
		const board = buildRallycrossLeaderboard(drivers, 500);
		expect(board.map((r) => r.driver_name)).toEqual(['Fast', 'Slow', 'NoShow']);
		expect(board[0].best_lap_ms).toBe(500);
	});

	it('breaks ties on more laps then name', () => {
		const drivers = [
			{ driver_id: 1, driver_name: 'Bob',   class_id: 1, class_name: 'A', tag: 'B', start_ms: 1000, passes: [2000] },
			{ driver_id: 2, driver_name: 'Alice', class_id: 1, class_name: 'A', tag: 'A', start_ms: 1000, passes: [2000, 3000] }
		];
		const board = buildRallycrossLeaderboard(drivers, 500);
		expect(board[0].driver_name).toBe('Alice');
	});
});

// ---------------------------------------------------------------------------
// Heat-based domain (new)
// ---------------------------------------------------------------------------

describe('computeHeatResult', () => {
	const entry = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		ts_ms: 1000,
		dnf: false,
		dnf_time_ms: null,
		passes: [1500, 3000, 4500]
	};

	it('computes laps and marks finished when required laps reached', () => {
		const r = computeHeatResult(entry, 1, 3, 500);
		expect(r.lap_count).toBe(3);
		expect(r.laps).toEqual([500, 1500, 1500]);
		expect(r.total_ms).toBe(3500);
		expect(r.best_lap_ms).toBe(500);
		expect(r.finished).toBe(true);
		expect(r.dnf).toBe(false);
		expect(r.heat_number).toBe(1);
	});

	it('not finished when fewer laps than required', () => {
		const r = computeHeatResult({ ...entry, passes: [1500, 3000] }, 1, 3, 500);
		expect(r.finished).toBe(false);
		expect(r.total_ms).toBeNull();
	});

	it('uses dnf_time_ms for DNF entries regardless of passes', () => {
		const r = computeHeatResult({ ...entry, dnf: true, dnf_time_ms: 99000, passes: [] }, 1, 3, 500);
		expect(r.dnf).toBe(true);
		expect(r.dnf_time_ms).toBe(99000);
		expect(r.finished).toBe(false);
		expect(r.lap_count).toBe(0);
	});
});

describe('computeDnfTime', () => {
	it('returns null when no finishers', () => {
		expect(computeDnfTime([])).toBeNull();
	});

	it('returns slowest total_ms + 30s', () => {
		const results = [
			{ total_ms: 60000, finished: true } as Parameters<typeof computeDnfTime>[0][0],
			{ total_ms: 90000, finished: true } as Parameters<typeof computeDnfTime>[0][0],
			{ total_ms: null,  finished: false } as Parameters<typeof computeDnfTime>[0][0]
		];
		expect(computeDnfTime(results)).toBe(120000); // 90000 + 30000
	});

	it('ignores non-finishers', () => {
		const results = [
			{ total_ms: null, finished: false } as Parameters<typeof computeDnfTime>[0][0]
		];
		expect(computeDnfTime(results)).toBeNull();
	});
});

describe('buildHeatLeaderboard', () => {
	const mkEntry = (name: string, passes: number[], dnf = false, dnf_time_ms: number | null = null) => ({
		driver_id: name.charCodeAt(0),
		driver_name: name,
		class_id: 1,
		class_name: 'A',
		tag: name,
		ts_ms: 0,
		dnf,
		dnf_time_ms,
		passes
	});

	it('finishers ranked by total_ms, then DNF by dnf_time_ms, then unfinished last', () => {
		const entries = [
			mkEntry('Unfinished', [60000]),                          // 1 of 3 laps
			mkEntry('DNF', [], true, 130000),                        // dnf
			mkEntry('Slow', [70000, 140000, 210000]),                // 3 laps, 210 000 ms total
			mkEntry('Fast', [50000, 100000, 150000])                 // 3 laps, 150 000 ms total
		];
		const board = buildHeatLeaderboard(entries, 1, 3, 500);
		expect(board.map((r) => r.driver_name)).toEqual(['Fast', 'Slow', 'DNF', 'Unfinished']);
	});

	it('heat_number is forwarded to each result', () => {
		const entries = [mkEntry('Anna', [50000, 100000, 150000])];
		const board = buildHeatLeaderboard(entries, 7, 3, 500);
		expect(board[0].heat_number).toBe(7);
	});
});

describe('buildOverallLeaderboard', () => {
	const mkResult = (
		driver_id: number,
		driver_name: string,
		heat_number: number,
		total_ms: number | null,
		finished: boolean
	) => ({
		driver_id,
		driver_name,
		class_id: 1,
		class_name: 'A',
		tag: driver_name,
		heat_number,
		laps: [],
		lap_count: finished ? 3 : 1,
		total_ms,
		best_lap_ms: total_ms ? total_ms / 3 : null,
		finished,
		dnf: false,
		dnf_time_ms: null
	});

	it('picks best total_ms across heats per driver', () => {
		const heatResults = [
			mkResult(1, 'Alice', 1, 180000, true),
			mkResult(1, 'Alice', 2, 160000, true),  // better heat
			mkResult(2, 'Bob',   1, 170000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		const alice = board.find((r) => r.driver_name === 'Alice')!;
		expect(alice.best_total_ms).toBe(160000);
		expect(alice.best_heat_number).toBe(2);
	});

	it('drivers with finished heats rank above those without', () => {
		const heatResults = [
			mkResult(1, 'Partial', 1, null, false),
			mkResult(2, 'Finisher', 1, 180000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].driver_name).toBe('Finisher');
	});

	it('sorts finishers by best_total_ms ascending', () => {
		const heatResults = [
			mkResult(1, 'Slow',  1, 200000, true),
			mkResult(2, 'Fast',  1, 150000, true),
			mkResult(3, 'Mid',   1, 175000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board.map((r) => r.driver_name)).toEqual(['Fast', 'Mid', 'Slow']);
	});
});

describe('suggestNextHeatGroups', () => {
	const mkStanding = (driver_id: number, driver_name: string, best_total_ms: number | null) => ({
		driver_id,
		driver_name,
		class_id: 1,
		class_name: 'A',
		best_total_ms,
		best_heat_number: best_total_ms ? 1 : null,
		heat_results: []
	});

	it('groups drivers into chunks of max_per_heat in standings order', () => {
		const standings = [
			mkStanding(1, 'P1', 100000),
			mkStanding(2, 'P2', 110000),
			mkStanding(3, 'P3', 120000),
			mkStanding(4, 'P4', 130000),
			mkStanding(5, 'P5', 140000),
			mkStanding(6, 'P6', null)
		];
		const groups = suggestNextHeatGroups(standings, 4);
		expect(groups).toEqual([[1, 2, 3, 4], [5, 6]]);
	});

	it('returns a single group when all fit', () => {
		const standings = [mkStanding(1, 'A', 100000), mkStanding(2, 'B', 110000)];
		expect(suggestNextHeatGroups(standings, 4)).toEqual([[1, 2]]);
	});
});

describe('buildRallycrossSubmission', () => {
	it('maps best heat per driver to rally_results shape', () => {
		const overallResults = [
			{
				driver_id: 1,
				driver_name: 'Alice',
				class_id: 1,
				class_name: 'Group A',
				best_total_ms: 160000,
				best_heat_number: 2,
				heat_results: [],
				driver_uuid: 'uuid-alice'
			},
			{
				driver_id: 2,
				driver_name: 'Bob',
				class_id: 2,
				class_name: 'Group B',
				best_total_ms: null,
				best_heat_number: null,
				heat_results: [],
				driver_uuid: 'uuid-bob'
			}
		];

		const rows = buildRallycrossSubmission(overallResults);
		// Only drivers with a finished heat are included
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			driver_uuid: 'uuid-alice',
			driver_name: 'Alice',
			class_id: 1,
			class_name: 'Group A',
			stage_name: 'Rallycross heat 2',
			elapsed_ms: 160000,
			dnf: false
		});
	});

	it('excludes drivers with no finished heat', () => {
		const rows = buildRallycrossSubmission([
			{ driver_id: 1, driver_name: 'X', class_id: 1, class_name: 'A',
			  best_total_ms: null, best_heat_number: null, heat_results: [], driver_uuid: 'u1' }
		]);
		expect(rows).toHaveLength(0);
	});
});
