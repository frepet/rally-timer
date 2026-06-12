import { describe, it, expect } from 'vitest';

import {
	buildRxDisplay,
	buildRxDisplayFromSubmission,
	isRallycrossSubmission
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
