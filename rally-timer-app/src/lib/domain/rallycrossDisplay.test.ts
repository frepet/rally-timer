import { describe, it, expect } from 'vitest';

import {
	buildRxDisplay,
	buildRxDisplayFromSubmission,
	applyRxRatings,
	isRallycrossSubmission,
	newFinishers
} from './rallycrossDisplay';
import type { HeatResult, OverallResult } from './rallycross';

function heatResult(partial: Partial<HeatResult> & { driver_name: string }): HeatResult {
	return {
		driver_id: 1,
		class_id: 1,
		class_name: 'A',
		tag: 'TAG',
		heat_number: 1,
		laps: [],
		lap_count: 0,
		total_ms: null,
		best_lap_ms: null,
		finished: false,
		dnf: false,
		dnf_time_ms: null,
		manual_position: null,
		...partial
	};
}

function overall(partial: Partial<OverallResult> & { driver_name: string }): OverallResult {
	return {
		driver_id: 1,
		class_id: 1,
		class_name: 'A',
		driver_uuid: `uuid-${partial.driver_name}`,
		total_points: 0,
		best_total_ms: null,
		best_lap_ms: null,
		best_heat_number: null,
		heat_results: [],
		...partial
	};
}

describe('buildRxDisplay', () => {
	it('ranks DNF drivers by laps with delta 0 across lap counts and a delta within equal laps', () => {
		const mk = (name: string, laps: number[], finished: boolean, dnf: boolean) =>
			heatResult({
				driver_name: name,
				laps,
				lap_count: laps.length,
				finished,
				dnf,
				total_ms: finished ? laps.reduce((a, b) => a + b, 0) : null
			});
		const results = [
			mk('Fin', [50000, 50000, 50000], true, false),
			mk('TwoA', [50000, 52000], false, true),
			mk('TwoB', [50000, 55000], false, true),
			mk('One', [60000], false, true)
		];
		const lb = results.map((r) => overall({ driver_name: r.driver_name, heat_results: [r] }));
		const entries = buildRxDisplay(lb).heats[0].entries;
		expect(entries.map((e) => e.driver_name)).toEqual(['Fin', 'TwoA', 'TwoB', 'One']);
		expect(entries.map((e) => e.total_ms)).toEqual([150000, 102000, 105000, 60000]);
		expect(entries.map((e) => e.delta_ms)).toEqual([0, 0, 3000, 0]);
	});

	it('returns empty display for empty leaderboard', () => {
		expect(buildRxDisplay([])).toEqual({ standings: [], heats: [] });
	});

	it('maps standings and groups heat results by heat number, newest first', () => {
		const leaderboard: OverallResult[] = [
			overall({
				driver_name: 'Alice',
				total_points: 7,
				best_total_ms: 60000,
				heat_results: [
					heatResult({ driver_name: 'Alice', heat_number: 1, total_ms: 61000, finished: true }),
					heatResult({ driver_name: 'Alice', heat_number: 2, total_ms: 60000, finished: true })
				]
			}),
			overall({
				driver_name: 'Bob',
				total_points: 5,
				best_total_ms: 62000,
				heat_results: [
					heatResult({ driver_name: 'Bob', heat_number: 1, total_ms: 62000, finished: true })
				]
			})
		];

		const display = buildRxDisplay(leaderboard);
		expect(display.standings.map((s) => s.driver_name)).toEqual(['Alice', 'Bob']);
		expect(display.heats.map((h) => h.number)).toEqual([2, 1]);
		expect(display.heats[1].entries.map((e) => e.driver_name)).toEqual(['Alice', 'Bob']);
		expect(display.heats[1].entries.map((e) => e.position)).toEqual([1, 2]);
	});
});

describe('newFinishers', () => {
	const results = [
		heatResult({ driver_id: 1, driver_name: 'Anna', finished: true }),
		heatResult({ driver_id: 2, driver_name: 'Bertil', finished: true }),
		heatResult({ driver_id: 3, driver_name: 'Cecilia', lap_count: 2 })
	];

	it('returns finishers not yet announced, with their finishing position', () => {
		expect(newFinishers(results, [1])).toEqual([
			{ driver_id: 2, driver_name: 'Bertil', position: 2 }
		]);
	});

	it('ignores drivers still on track', () => {
		expect(newFinishers(results, [1, 2])).toEqual([]);
	});
});

describe('isRallycrossSubmission', () => {
	it('is false for empty results', () => {
		expect(isRallycrossSubmission([])).toBe(false);
	});

	it('is true when any stage matches the heat pattern', () => {
		expect(
			isRallycrossSubmission([{ stage_name: 'SS1' }, { stage_name: 'Rallycross heat 3' }])
		).toBe(true);
	});

	it('is false for plain rally stages', () => {
		expect(isRallycrossSubmission([{ stage_name: 'SS1' }, { stage_name: 'SS2' }])).toBe(false);
	});
});

describe('buildRxDisplayFromSubmission', () => {
	const row = (
		stage: number,
		driver: string,
		elapsed: number | null,
		dnf = false,
		bestLap: number | null = null
	) => ({
		stage_name: `Rallycross heat ${stage}`,
		driver_name: driver,
		class_name: 'A',
		elapsed_ms: elapsed,
		best_lap_ms: bestLap,
		dnf
	});

	it('orders heat entries by time with DNF drivers last', () => {
		const display = buildRxDisplayFromSubmission([
			row(1, 'Slow', 70000),
			row(1, 'Fast', 60000),
			row(1, 'Broken', null, true)
		]);

		expect(display.heats).toHaveLength(1);
		expect(display.heats[0].entries.map((e) => e.driver_name)).toEqual(['Fast', 'Slow', 'Broken']);
		expect(display.heats[0].entries[2].dnf).toBe(true);
	});

	it('orders two DNF drivers deterministically by name', () => {
		const display = buildRxDisplayFromSubmission([
			row(1, 'Zed', null, true),
			row(1, 'Anna', null, true)
		]);
		expect(display.heats[0].entries.map((e) => e.driver_name)).toEqual(['Anna', 'Zed']);
	});

	it('awards points per heat and accumulates standings, DNF gives zero', () => {
		const display = buildRxDisplayFromSubmission([
			// Heat 1: Fast wins (2p), Slow second (1p)
			row(1, 'Fast', 60000),
			row(1, 'Slow', 70000),
			// Heat 2: Slow wins (2p), Fast DNFs (0p)
			row(2, 'Slow', 69000),
			row(2, 'Fast', null, true)
		]);

		const byName = new Map(display.standings.map((s) => [s.driver_name, s]));
		expect(byName.get('Slow')?.total_points).toBe(3);
		expect(byName.get('Fast')?.total_points).toBe(2);
		// Standings sorted by points desc
		expect(display.standings[0].driver_name).toBe('Slow');
	});

	it('tracks best total and best lap across heats', () => {
		const display = buildRxDisplayFromSubmission([
			row(1, 'Fast', 65000, false, 21000),
			row(2, 'Fast', 60000, false, 22000)
		]);
		expect(display.standings[0].best_total_ms).toBe(60000);
		expect(display.standings[0].best_lap_ms).toBe(21000);
	});

	it('ignores non-rallycross stage rows', () => {
		const display = buildRxDisplayFromSubmission([
			row(1, 'Fast', 60000),
			{
				stage_name: 'SS1',
				driver_name: 'Fast',
				class_name: 'A',
				elapsed_ms: 99999,
				best_lap_ms: null,
				dnf: false
			}
		]);
		expect(display.heats).toHaveLength(1);
		expect(display.standings[0].best_total_ms).toBe(60000);
	});

	it('lists heats newest first', () => {
		const display = buildRxDisplayFromSubmission([row(1, 'A', 1000), row(3, 'A', 1000)]);
		expect(display.heats.map((h) => h.number)).toEqual([3, 1]);
	});
});

describe('applyRxRatings', () => {
	const rows = (heat: number, order: string[]) =>
		order.map((n, i) => ({
			stage_name: `Rallycross heat ${heat}`,
			driver_uuid: `u-${n}`,
			heat_position: i + 1,
			driver_name: n,
			class_name: 'A',
			elapsed_ms: null,
			best_lap_ms: null,
			dnf: false
		}));

	it('keeps the stored heat order and adds per-heat and event rating deltas', () => {
		const display = applyRxRatings(
			buildRxDisplayFromSubmission([...rows(1, ['Zed', 'Amy']), ...rows(2, ['Amy', 'Zed'])]),
			new Map()
		);
		const heat1 = display.heats.find((h) => h.number === 1)!;
		expect(heat1.entries.map((e) => e.driver_name)).toEqual(['Zed', 'Amy']);
		expect(heat1.entries.map((e) => e.rating_delta)).toEqual([16, -16]);
		const amy = display.standings.find((s) => s.driver_name === 'Amy')!;
		// lost heat 1 (-16), won heat 2 against a now-lower-rated Zed (+16 +/- small)
		expect(amy.rating).toBe(1500 + (amy.rating_delta ?? 0));
		expect(amy.rating_delta).toBeGreaterThan(-1);
	});
});
