import { describe, it, expect } from 'vitest';
import { aggregateRallyResults, compareRallyDrivers, type RallyStageRow } from './rallyResults';

function row(overrides: Partial<RallyStageRow> & { driver_uuid: string }): RallyStageRow {
	return {
		rally_id: 'r1',
		rally_name: 'Finland',
		driver_name: overrides.driver_uuid,
		class_id: 1,
		class_name: 'A',
		elapsed_ms: 10000,
		dnf: false,
		...overrides
	};
}

describe('aggregateRallyResults', () => {
	it('returns empty array for no rows', () => {
		expect(aggregateRallyResults([])).toEqual([]);
	});

	it('produces one entry per unique (rally_id, class_id, driver_uuid)', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', elapsed_ms: 12000 }),
			row({ driver_uuid: 'bob', elapsed_ms: 11000 })
		]);
		expect(result).toHaveLength(2);
	});

	it('sums elapsed_ms across stages for the same driver', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', elapsed_ms: 12000 })
		]);
		expect(result[0].total_ms).toBe(22000);
	});

	it('counts non-null elapsed_ms as finished_stages', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', elapsed_ms: 12000 })
		]);
		expect(result[0].finished_stages).toBe(2);
	});

	it('null elapsed_ms does not increment finished_stages or total_ms', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', elapsed_ms: null })
		]);
		expect(result[0].finished_stages).toBe(1);
		expect(result[0].total_ms).toBe(10000);
	});

	it('sets is_dnf=true if any row has dnf=true', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', elapsed_ms: 10000, dnf: false }),
			row({ driver_uuid: 'alice', elapsed_ms: 12000, dnf: true })
		]);
		expect(result[0].is_dnf).toBe(true);
	});

	it('sets is_dnf=false if no row has dnf=true', () => {
		const result = aggregateRallyResults([row({ driver_uuid: 'alice', elapsed_ms: 10000 })]);
		expect(result[0].is_dnf).toBe(false);
	});

	it('partitions correctly by rally_id', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', rally_id: 'r1', elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', rally_id: 'r2', elapsed_ms: 12000 })
		]);
		expect(result).toHaveLength(2);
		expect(result.find((r) => r.rally_id === 'r1')!.total_ms).toBe(10000);
		expect(result.find((r) => r.rally_id === 'r2')!.total_ms).toBe(12000);
	});

	it('partitions correctly by class_id', () => {
		const result = aggregateRallyResults([
			row({ driver_uuid: 'alice', class_id: 1, elapsed_ms: 10000 }),
			row({ driver_uuid: 'alice', class_id: 2, elapsed_ms: 12000 })
		]);
		expect(result).toHaveLength(2);
	});

	it('preserves metadata from the first row seen for a driver', () => {
		const result = aggregateRallyResults([
			row({
				driver_uuid: 'alice',
				driver_name: 'Alice A',
				class_name: 'Group A',
				elapsed_ms: 10000
			}),
			row({
				driver_uuid: 'alice',
				driver_name: 'Alice A',
				class_name: 'Group A',
				elapsed_ms: 12000
			})
		]);
		expect(result[0].driver_name).toBe('Alice A');
		expect(result[0].class_name).toBe('Group A');
	});
});

describe('compareRallyDrivers', () => {
	const base = { driver_name: 'Alice', finished_stages: 2, total_ms: 30000 };

	it('a DNF driver with lower total_ms ranks before a clean driver — dnf does not demote', () => {
		// The DNF penalty time is already included in total_ms; dnf must not be a sort key.
		const dnfDriver = { ...base, driver_name: 'Bob', total_ms: 25000, is_dnf: true };
		const cleanDriver = { ...base, is_dnf: false };
		expect(compareRallyDrivers(dnfDriver, cleanDriver)).toBeLessThan(0);
		expect(compareRallyDrivers(cleanDriver, dnfDriver)).toBeGreaterThan(0);
	});

	it('more finished_stages ranks higher regardless of total_ms', () => {
		const more = { ...base, finished_stages: 3, total_ms: 40000 };
		const fewer = { ...base, finished_stages: 2, total_ms: 25000 };
		expect(compareRallyDrivers(more, fewer)).toBeLessThan(0);
	});

	it('among equal finished_stages, lower total_ms ranks higher', () => {
		expect(compareRallyDrivers(base, { ...base, total_ms: 35000 })).toBeLessThan(0);
		expect(compareRallyDrivers({ ...base, total_ms: 35000 }, base)).toBeGreaterThan(0);
	});

	it('among equal finished_stages and total_ms, driver_name ascending breaks tie', () => {
		expect(
			compareRallyDrivers({ ...base, driver_name: 'Alice' }, { ...base, driver_name: 'Bob' })
		).toBeLessThan(0);
	});

	it('equal entries compare as 0', () => {
		expect(compareRallyDrivers(base, { ...base })).toBe(0);
	});
});
