import { describe, it, expect } from 'vitest';
import { rankRallyResultsByClass } from './championshipRanking';
import { type RallyDriverResult } from './rallyResults';

function row(overrides: Partial<RallyDriverResult> & { driver_name: string }): RallyDriverResult {
	return {
		rally_id: 'r1',
		rally_name: 'Norway',
		driver_uuid: `uuid-${overrides.driver_name}`,
		class_id: 1,
		class_name: 'A',
		finished_stages: 1,
		total_ms: 0,
		is_dnf: false,
		...overrides
	};
}

describe('rankRallyResultsByClass', () => {
	it('returns empty array for no rows', () => {
		expect(rankRallyResultsByClass([])).toEqual([]);
	});

	it('assigns position 1 to the only driver in a class', () => {
		const result = rankRallyResultsByClass([row({ driver_name: 'Alice', total_ms: 423000 })]);
		expect(result[0].position).toBe(1);
	});

	it('orders by finished_stages desc then total_ms asc within a class', () => {
		const result = rankRallyResultsByClass([
			row({ driver_name: 'Bob', finished_stages: 2, total_ms: 440000 }),
			row({ driver_name: 'Alice', finished_stages: 3, total_ms: 423000 }),
			row({ driver_name: 'Carol', finished_stages: 2, total_ms: 510000 })
		]);
		const byPosition = [...result].sort((a, b) => a.position - b.position);
		expect(byPosition.map((r) => r.driver_name)).toEqual(['Alice', 'Bob', 'Carol']);
	});

	it('driver with more finished stages ranks above one with fewer even if total_ms is higher', () => {
		const result = rankRallyResultsByClass([
			row({ driver_name: 'Bob', finished_stages: 2, total_ms: 23606 }),
			row({ driver_name: 'Alice', finished_stages: 3, total_ms: 34726 })
		]);
		const byPosition = [...result].sort((a, b) => a.position - b.position);
		expect(byPosition.map((r) => r.driver_name)).toEqual(['Alice', 'Bob']);
	});

	it('ranks a DNF driver by total_ms like everyone else — the penalty time is the punishment', () => {
		const result = rankRallyResultsByClass([
			row({ driver_name: 'Bob', total_ms: 440000 }),
			row({ driver_name: 'Diana', total_ms: 400000, is_dnf: true }),
			row({ driver_name: 'Alice', total_ms: 423000 })
		]);
		const byPosition = [...result].sort((a, b) => a.position - b.position);
		expect(byPosition.map((r) => r.driver_name)).toEqual(['Diana', 'Alice', 'Bob']);
		expect(byPosition[0].is_dnf).toBe(true);
	});

	it('partitions positions independently per (rally_id, class_id)', () => {
		const result = rankRallyResultsByClass([
			row({ rally_id: 'r1', class_id: 1, driver_name: 'Alice', total_ms: 423000 }),
			row({ rally_id: 'r1', class_id: 1, driver_name: 'Bob', total_ms: 440000 }),
			row({ rally_id: 'r1', class_id: 2, driver_name: 'Carol', total_ms: 600000 }),
			row({ rally_id: 'r2', class_id: 1, driver_name: 'Diana', total_ms: 500000 })
		]);
		const lookup = new Map(
			result.map((r) => [`${r.rally_id}:${r.class_id}:${r.driver_name}`, r.position])
		);
		expect(lookup.get('r1:1:Alice')).toBe(1);
		expect(lookup.get('r1:1:Bob')).toBe(2);
		expect(lookup.get('r1:2:Carol')).toBe(1);
		expect(lookup.get('r2:1:Diana')).toBe(1);
	});

	it('breaks total_ms ties by driver_name ascending', () => {
		const result = rankRallyResultsByClass([
			row({ driver_name: 'Bob', total_ms: 423000 }),
			row({ driver_name: 'Alice', total_ms: 423000 })
		]);
		const byPosition = [...result].sort((a, b) => a.position - b.position);
		expect(byPosition.map((r) => r.driver_name)).toEqual(['Alice', 'Bob']);
	});

	it('DNF drivers with equal totals order by name among themselves', () => {
		const result = rankRallyResultsByClass([
			row({ driver_name: 'Alice', total_ms: 423000 }),
			row({ driver_name: 'Charlie', total_ms: 500000, is_dnf: true }),
			row({ driver_name: 'Bob', total_ms: 500000, is_dnf: true })
		]);
		const byPosition = [...result].sort((a, b) => a.position - b.position);
		expect(byPosition.map((r) => r.driver_name)).toEqual(['Alice', 'Bob', 'Charlie']);
	});

	it('does not mutate the input array', () => {
		const input: RallyDriverResult[] = [
			row({ driver_name: 'Bob', total_ms: 440000 }),
			row({ driver_name: 'Alice', total_ms: 423000 })
		];
		const snapshot = input.map((r) => r.driver_name);
		rankRallyResultsByClass(input);
		expect(input.map((r) => r.driver_name)).toEqual(snapshot);
	});
});
