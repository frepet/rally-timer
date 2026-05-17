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
	computeHeatPoints,
	suggestNextHeatGroups,
	buildRallycrossSubmission,
	getHeatResults,
	type HeatEntry,
	type HeatResult,
	type OverallResult
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
			{
				driver_id: 1,
				driver_name: 'Slow',
				class_id: 1,
				class_name: 'A',
				tag: 'S',
				start_ms: 1000,
				passes: [3000, 5000]
			},
			{
				driver_id: 2,
				driver_name: 'Fast',
				class_id: 1,
				class_name: 'A',
				tag: 'F',
				start_ms: 1000,
				passes: [1500, 2500]
			},
			{
				driver_id: 3,
				driver_name: 'NoShow',
				class_id: 1,
				class_name: 'A',
				tag: 'N',
				start_ms: null,
				passes: []
			}
		];
		const board = buildRallycrossLeaderboard(drivers, 500);
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
				start_ms: 1000,
				passes: [2000]
			},
			{
				driver_id: 2,
				driver_name: 'Alice',
				class_id: 1,
				class_name: 'A',
				tag: 'A',
				start_ms: 1000,
				passes: [2000, 3000]
			}
		];
		const board = buildRallycrossLeaderboard(drivers, 500);
		expect(board[0].driver_name).toBe('Alice');
	});
});

// ---------------------------------------------------------------------------
// Heat-based domain (new)
// ---------------------------------------------------------------------------

describe('computeHeatResult', () => {
	const entry: HeatEntry = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		ts_ms: 1000,
		dnf: false,
		dnf_time_ms: null,
		passes: [1500, 3000, 4500],
		manual_position: null
	};

	it('computes laps and marks finished when required laps reached', () => {
		const r = computeHeatResult(entry, 1, 3, 500);
		expect(r.lap_count).toBe(3);
		expect(r.laps).toEqual([500, 1500, 1500]);
		expect(r.total_ms).toBe(3500);
		// First lap (500ms) is the out lap and is excluded from best_lap_ms
		expect(r.best_lap_ms).toBe(1500);
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

describe('computeHeatResult — best_lap_ms excludes out lap', () => {
	const base: HeatEntry = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		ts_ms: 1000,
		dnf: false,
		dnf_time_ms: null,
		passes: [],
		manual_position: null
	};

	it('returns null when no laps completed', () => {
		const r = computeHeatResult(base, 1, 3, 500);
		expect(r.best_lap_ms).toBeNull();
	});

	it('returns null when only the out lap completed (1 lap total)', () => {
		// passes=[2000] → laps=[1000]; only the out lap, no timed laps
		const r = computeHeatResult({ ...base, passes: [2000] }, 1, 3, 500);
		expect(r.lap_count).toBe(1);
		expect(r.best_lap_ms).toBeNull();
	});

	it('excludes out lap and picks minimum of remaining laps', () => {
		// ts_ms=1000, passes=[1500,3000,4500] → laps=[500,1500,1500]
		// out lap=500ms, best of laps[1+]=min(1500,1500)=1500
		const r = computeHeatResult({ ...base, passes: [1500, 3000, 4500] }, 1, 3, 500);
		expect(r.best_lap_ms).toBe(1500);
	});

	it('picks the fastest non-out lap when laps differ', () => {
		// ts_ms=1000, passes=[2000,3200,4600] → laps=[1000,1200,1400]
		// out lap=1000ms, best of laps[1+]=min(1200,1400)=1200
		const r = computeHeatResult({ ...base, passes: [2000, 3200, 4600] }, 1, 3, 500);
		expect(r.best_lap_ms).toBe(1200);
	});
});

describe('computeHeatResult with manual_position', () => {
	const entry: HeatEntry = {
		driver_id: 1,
		driver_name: 'Anna',
		class_id: 1,
		class_name: 'Group A',
		tag: 'A1',
		ts_ms: 1000,
		dnf: false,
		dnf_time_ms: null,
		passes: [1500, 3000, 4500],
		manual_position: null
	};

	it('when manual_position is set, marks finished with no timing data', () => {
		const r = computeHeatResult({ ...entry, manual_position: 1, passes: [] }, 1, 3, 500);
		expect(r.finished).toBe(true);
		expect(r.total_ms).toBeNull();
		expect(r.laps).toEqual([]);
		expect(r.lap_count).toBe(0);
		expect(r.best_lap_ms).toBeNull();
		expect(r.dnf).toBe(false);
		expect(r.manual_position).toBe(1);
	});

	it('ignores passes when manual_position is set', () => {
		const r = computeHeatResult({ ...entry, manual_position: 2 }, 1, 3, 500);
		expect(r.finished).toBe(true);
		expect(r.total_ms).toBeNull();
		expect(r.lap_count).toBe(0);
		expect(r.manual_position).toBe(2);
	});

	it('null manual_position falls through to normal timed result', () => {
		const r = computeHeatResult(entry, 1, 3, 500);
		expect(r.manual_position).toBeNull();
		expect(r.finished).toBe(true);
		expect(r.total_ms).toBe(3500);
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
			{ total_ms: null, finished: false } as Parameters<typeof computeDnfTime>[0][0]
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
	const mkEntry = (
		name: string,
		passes: number[],
		dnf = false,
		dnf_time_ms: number | null = null,
		manual_position: number | null = null
	): HeatEntry => ({
		driver_id: name.charCodeAt(0),
		driver_name: name,
		class_id: 1,
		class_name: 'A',
		tag: name,
		ts_ms: 0,
		dnf,
		dnf_time_ms,
		passes,
		manual_position
	});

	it('finishers ranked by total_ms, then DNF by dnf_time_ms, then unfinished last', () => {
		const entries = [
			mkEntry('Unfinished', [60000]), // 1 of 3 laps
			mkEntry('DNF', [], true, 130000), // dnf
			mkEntry('Slow', [70000, 140000, 210000]), // 3 laps, 210 000 ms total
			mkEntry('Fast', [50000, 100000, 150000]) // 3 laps, 150 000 ms total
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

describe('buildHeatLeaderboard with manual positions', () => {
	const mkManualEntry = (name: string, pos: number): HeatEntry => ({
		driver_id: name.charCodeAt(0),
		driver_name: name,
		class_id: 1,
		class_name: 'A',
		tag: name,
		ts_ms: 0,
		dnf: false,
		dnf_time_ms: null,
		passes: [],
		manual_position: pos
	});

	it('sorts by manual_position ascending', () => {
		const entries = [
			mkManualEntry('Third', 3),
			mkManualEntry('First', 1),
			mkManualEntry('Second', 2)
		];
		const board = buildHeatLeaderboard(entries, 1, 3, 500);
		expect(board.map((r) => r.driver_name)).toEqual(['First', 'Second', 'Third']);
		expect(board.every((r) => r.finished)).toBe(true);
		expect(board.every((r) => r.total_ms === null)).toBe(true);
	});

	it('manual finishers rank above DNF', () => {
		const entries = [
			{
				driver_id: 1,
				driver_name: 'DNF',
				class_id: 1,
				class_name: 'A',
				tag: 'DNF',
				ts_ms: 0,
				dnf: true,
				dnf_time_ms: 130000,
				passes: [],
				manual_position: null
			},
			mkManualEntry('Second', 2),
			mkManualEntry('First', 1)
		];
		const board = buildHeatLeaderboard(entries, 1, 3, 500);
		expect(board.map((r) => r.driver_name)).toEqual(['First', 'Second', 'DNF']);
	});

	it('manual finishers have manual_position in result', () => {
		const board = buildHeatLeaderboard([mkManualEntry('Alice', 1)], 1, 3, 500);
		expect(board[0].manual_position).toBe(1);
	});
});

describe('computeHeatPoints', () => {
	const mkResult = (
		driver_id: number,
		driver_name: string,
		class_id: number,
		total_ms: number | null,
		finished: boolean,
		lap_count = 1,
		manual_position: number | null = null
	): HeatResult => ({
		driver_id,
		driver_name,
		class_id,
		class_name: `C${class_id}`,
		tag: driver_name,
		heat_number: 1,
		laps: [],
		lap_count,
		total_ms,
		best_lap_ms: null,
		finished,
		dnf: false,
		dnf_time_ms: null,
		manual_position
	});

	it('1st of 3 gets 3 pts, last gets 1 pt', () => {
		const pts = computeHeatPoints([
			mkResult(1, 'Fast', 1, 100000, true),
			mkResult(2, 'Mid', 1, 120000, true),
			mkResult(3, 'Slow', 1, 140000, true)
		]);
		expect(pts.get(1)).toBe(3);
		expect(pts.get(2)).toBe(2);
		expect(pts.get(3)).toBe(1);
	});

	it('points are overall across all classes', () => {
		// 3 drivers from different classes race together
		const pts = computeHeatPoints([
			mkResult(1, 'A1', 1, 100000, true), // 1st overall → 3 pts
			mkResult(2, 'B1', 2, 200000, true), // 3rd overall → 1 pt
			mkResult(3, 'C1', 3, 150000, true) // 2nd overall → 2 pts
		]);
		expect(pts.get(1)).toBe(3);
		expect(pts.get(3)).toBe(2);
		expect(pts.get(2)).toBe(1);
	});

	it('awards points by manual_position order', () => {
		const pts = computeHeatPoints([
			mkResult(1, 'Third', 1, null, true, 0, 3),
			mkResult(2, 'First', 1, null, true, 0, 1),
			mkResult(3, 'Second', 1, null, true, 0, 2)
		]);
		expect(pts.get(2)).toBe(3); // 1st place
		expect(pts.get(3)).toBe(2); // 2nd place
		expect(pts.get(1)).toBe(1); // 3rd place
	});
});

describe('buildOverallLeaderboard', () => {
	const mkResult = (
		driver_id: number,
		driver_name: string,
		heat_number: number,
		total_ms: number | null,
		finished: boolean,
		class_id = 1,
		manual_position: number | null = null
	): HeatResult => ({
		driver_id,
		driver_name,
		class_id,
		class_name: `C${class_id}`,
		tag: driver_name,
		heat_number,
		laps: [],
		lap_count: finished ? 3 : 1,
		total_ms,
		best_lap_ms: total_ms ? total_ms / 3 : null,
		finished,
		dnf: false,
		dnf_time_ms: null,
		manual_position
	});

	it('picks best total_ms across heats per driver', () => {
		const heatResults = [
			mkResult(1, 'Alice', 1, 180000, true),
			mkResult(1, 'Alice', 2, 160000, true), // better heat
			mkResult(2, 'Bob', 1, 170000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		const alice = board.find((r) => r.driver_name === 'Alice')!;
		expect(alice.best_total_ms).toBe(160000);
		expect(alice.best_heat_number).toBe(2);
	});

	it('ranks by total_points descending', () => {
		// Single heat, 3 drivers same class: Fast=3pts, Mid=2pts, Slow=1pt
		const heatResults = [
			mkResult(1, 'Slow', 1, 200000, true),
			mkResult(2, 'Fast', 1, 150000, true),
			mkResult(3, 'Mid', 1, 175000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board.map((r) => r.driver_name)).toEqual(['Fast', 'Mid', 'Slow']);
		expect(board[0].total_points).toBe(3);
		expect(board[2].total_points).toBe(1);
	});

	it('accumulates points across multiple heats', () => {
		// Heat 1: Alice 1st (2pts), Bob 2nd (1pt)
		// Heat 2: Bob 1st (2pts), Alice 2nd (1pt)
		// Total: Alice=3, Bob=3 → tie broken by best_total_ms
		const heatResults = [
			mkResult(1, 'Alice', 1, 100000, true),
			mkResult(2, 'Bob', 1, 120000, true),
			mkResult(2, 'Bob', 2, 90000, true),
			mkResult(1, 'Alice', 2, 110000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].total_points).toBe(3);
		expect(board[1].total_points).toBe(3);
		// Both have 3 pts; best_total_ms: Alice=100000, Bob=90000 → Bob wins tiebreaker
		expect(board[0].driver_name).toBe('Bob');
	});

	it('drivers with finished heats rank above those without', () => {
		const heatResults = [
			mkResult(1, 'Partial', 1, null, false),
			mkResult(2, 'Finisher', 1, 180000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].driver_name).toBe('Finisher');
	});

	it('accumulates points from manual heats; best_total_ms stays null', () => {
		const heatResults = [
			mkResult(1, 'Alice', 1, null, true, 1, 1), // 1st manual → 2 pts
			mkResult(2, 'Bob', 1, null, true, 1, 2) // 2nd manual → 1 pt
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].driver_name).toBe('Alice');
		expect(board[0].total_points).toBe(2);
		expect(board[0].best_total_ms).toBeNull();
		expect(board[1].total_points).toBe(1);
	});

	it('timed best_total_ms beats null in tiebreak', () => {
		// Alice: 1st in timed heat (total 150000ms) → 2 pts
		// Bob:   1st in manual heat (no time)       → 2 pts
		// Tie on points; Alice has best_total_ms so she wins tiebreak
		const heatResults = [
			mkResult(1, 'Alice', 1, 150000, true, 3, null),
			mkResult(2, 'Bob', 2, null, true, 1, 1)
		];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].driver_name).toBe('Alice');
	});

	it('best_lap_ms is the minimum best_lap_ms across all heats', () => {
		// mkResult sets best_lap_ms = total_ms / 3
		// Alice heat 1: total=180000 → best_lap_ms=60000
		// Alice heat 2: total=150000 → best_lap_ms=50000  ← better
		// Bob heat 1:   total=170000 → best_lap_ms≈56667
		const heatResults = [
			mkResult(1, 'Alice', 1, 180000, true),
			mkResult(1, 'Alice', 2, 150000, true),
			mkResult(2, 'Bob', 1, 170000, true)
		];
		const board = buildOverallLeaderboard(heatResults);
		const alice = board.find((r) => r.driver_name === 'Alice')!;
		expect(alice.best_lap_ms).toBe(50000); // 150000 / 3
	});

	it('best_lap_ms is null when no heat has timing data', () => {
		const heatResults = [mkResult(1, 'Alice', 1, null, true, 1, 1)];
		const board = buildOverallLeaderboard(heatResults);
		expect(board[0].best_lap_ms).toBeNull();
	});
});

describe('suggestNextHeatGroups', () => {
	const mkStanding = (
		driver_id: number,
		class_name: string,
		best_total_ms: number | null,
		heatCount = 0
	) => ({
		driver_id,
		driver_name: `D${driver_id}`,
		class_id: 1,
		class_name,
		best_total_ms,
		best_heat_number: best_total_ms !== null ? 1 : null,
		heat_results: Array(heatCount).fill({}) as HeatResult[]
	});

	it('sorts by class then heat count then best time, then slices into groups', () => {
		const standings = [
			mkStanding(1, 'A', 100000, 0),
			mkStanding(2, 'A', 110000, 0),
			mkStanding(3, 'A', 120000, 0),
			mkStanding(4, 'A', 130000, 0),
			mkStanding(5, 'A', 140000, 0),
			mkStanding(6, 'A', null, 0)
		];
		expect(suggestNextHeatGroups(standings, 4)).toEqual([
			[1, 2, 3, 4],
			[5, 6]
		]);
	});

	it('prioritises drivers with fewer heats driven', () => {
		const standings = [
			mkStanding(1, 'A', 100000, 2), // 2 heats — should go last
			mkStanding(2, 'A', 90000, 1), // 1 heat — middle
			mkStanding(3, 'A', 80000, 0) // 0 heats — first
		];
		expect(suggestNextHeatGroups(standings, 2)).toEqual([[3, 2], [1]]);
	});

	it('sorts by class before heat count', () => {
		const standings = [
			mkStanding(1, 'B', 100000, 0),
			mkStanding(2, 'A', 200000, 1), // class A but more heats
			mkStanding(3, 'A', 110000, 0)
		];
		// class A before B; within A: 0 heats first; within same heat count: best time first
		expect(suggestNextHeatGroups(standings, 2)).toEqual([[3, 2], [1]]);
	});

	it('puts null best_total_ms last within same heat count', () => {
		const standings = [mkStanding(1, 'A', null, 1), mkStanding(2, 'A', 100000, 1)];
		expect(suggestNextHeatGroups(standings, 4)).toEqual([[2, 1]]);
	});

	it('returns a single group when all fit', () => {
		const standings = [mkStanding(1, 'A', 100000), mkStanding(2, 'A', 110000)];
		expect(suggestNextHeatGroups(standings, 4)).toEqual([[1, 2]]);
	});
});

describe('buildRallycrossSubmission', () => {
	const mkHeatResult = (
		driver_id: number,
		driver_name: string,
		heat_number: number,
		finished: boolean,
		total_ms: number | null,
		dnf = false
	) => ({
		driver_id,
		driver_name,
		class_id: 1,
		class_name: 'Group A',
		tag: `tag${driver_id}`,
		heat_number,
		laps: [],
		lap_count: 0,
		total_ms,
		best_lap_ms: null,
		finished,
		dnf,
		dnf_time_ms: null,
		manual_position: null,
		driver_uuid: `uuid-${driver_name.toLowerCase()}`
	});

	it('emits one row per driver per heat with actual elapsed_ms', () => {
		// Results pre-sorted by heatResultComparator (as buildHeatLeaderboard returns)
		const results = [
			mkHeatResult(1, 'Alice', 1, true, 30000), // 1st in heat 1
			mkHeatResult(2, 'Bob', 1, true, 32000), // 2nd in heat 1
			mkHeatResult(2, 'Bob', 2, true, 29000), // 1st in heat 2
			mkHeatResult(1, 'Alice', 2, true, 31000) // 2nd in heat 2
		];
		const rows = buildRallycrossSubmission(results);
		expect(rows).toHaveLength(4);
		expect(rows[0]).toMatchObject({
			stage_name: 'Rallycross heat 1',
			driver_name: 'Alice',
			elapsed_ms: 30000,
			dnf: false
		});
		expect(rows[1]).toMatchObject({
			stage_name: 'Rallycross heat 1',
			driver_name: 'Bob',
			elapsed_ms: 32000,
			dnf: false
		});
		expect(rows[2]).toMatchObject({
			stage_name: 'Rallycross heat 2',
			driver_name: 'Bob',
			elapsed_ms: 29000,
			dnf: false
		});
		expect(rows[3]).toMatchObject({
			stage_name: 'Rallycross heat 2',
			driver_name: 'Alice',
			elapsed_ms: 31000,
			dnf: false
		});
	});

	it('DNF entries get elapsed_ms null and dnf true', () => {
		const rows = buildRallycrossSubmission([
			mkHeatResult(1, 'Alice', 1, true, 30000),
			mkHeatResult(2, 'Bob', 1, false, null, true)
		]);
		expect(rows[0]).toMatchObject({ elapsed_ms: 30000, dnf: false });
		expect(rows[1]).toMatchObject({ elapsed_ms: null, dnf: true });
	});

	it('unfinished non-DNF drivers get elapsed_ms null', () => {
		// Driver completed fewer laps but is not explicitly DNF — no time stored
		const rows = buildRallycrossSubmission([
			mkHeatResult(1, 'Alice', 1, true, 30000),
			mkHeatResult(2, 'Bob', 1, false, null, false)
		]);
		expect(rows[0]).toMatchObject({ elapsed_ms: 30000, dnf: false });
		expect(rows[1]).toMatchObject({ elapsed_ms: null, dnf: false });
	});

	it('sets elapsed_ms null for finished entries with no time (manual position)', () => {
		const result = { ...mkHeatResult(1, 'Alice', 1, true, null), manual_position: 1 };
		const rows = buildRallycrossSubmission([result]);
		expect(rows[0]).toMatchObject({ dnf: false, elapsed_ms: null });
	});
});

describe('getHeatResults', () => {
	const mkOverall = (
		driver_id: number,
		driver_name: string,
		heatResults: HeatResult[]
	): OverallResult => ({
		driver_id,
		driver_name,
		class_id: 1,
		class_name: 'A',
		driver_uuid: `uuid-${driver_id}`,
		total_points: 0,
		best_total_ms: null,
		best_lap_ms: null,
		best_heat_number: null,
		heat_results: heatResults
	});

	const mkHR = (
		driver_id: number,
		driver_name: string,
		heat_number: number,
		total_ms: number | null,
		finished: boolean
	): HeatResult => ({
		driver_id,
		driver_name,
		class_id: 1,
		class_name: 'A',
		tag: driver_name,
		heat_number,
		laps: [],
		lap_count: finished ? 3 : 1,
		total_ms,
		best_lap_ms: null,
		finished,
		dnf: false,
		dnf_time_ms: null,
		manual_position: null
	});

	it('returns empty array when leaderboard is empty', () => {
		expect(getHeatResults([], 1)).toEqual([]);
	});

	it('returns only results for the given heat number', () => {
		const overall = mkOverall(1, 'Alice', [
			mkHR(1, 'Alice', 1, 100000, true),
			mkHR(1, 'Alice', 2, 90000, true)
		]);
		const result = getHeatResults([overall], 1);
		expect(result).toHaveLength(1);
		expect(result[0].heat_number).toBe(1);
	});

	it('collects results from all drivers for that heat', () => {
		const d1 = mkOverall(1, 'Alice', [mkHR(1, 'Alice', 1, 100000, true)]);
		const d2 = mkOverall(2, 'Bob', [mkHR(2, 'Bob', 1, 110000, true)]);
		const result = getHeatResults([d1, d2], 1);
		expect(result).toHaveLength(2);
	});

	it('sorts results using heatResultComparator (faster finisher first)', () => {
		const d1 = mkOverall(1, 'Slow', [mkHR(1, 'Slow', 1, 120000, true)]);
		const d2 = mkOverall(2, 'Fast', [mkHR(2, 'Fast', 1, 100000, true)]);
		const result = getHeatResults([d1, d2], 1);
		expect(result[0].driver_name).toBe('Fast');
	});

	it('returns empty array when no results match the heat number', () => {
		const overall = mkOverall(1, 'Alice', [mkHR(1, 'Alice', 2, 100000, true)]);
		expect(getHeatResults([overall], 1)).toEqual([]);
	});
});
