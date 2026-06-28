import { describe, it, expect } from 'vitest';
import { computeStartOrder, type StartOrderDriver } from './startOrder';

function driver(
	overrides: Partial<StartOrderDriver> & { id: number; name: string }
): StartOrderDriver {
	return {
		rfid_tag: `tag-${overrides.id}`,
		class_id: 1,
		class_name: 'A',
		class_start_priority: 0,
		total_ms: null,
		...overrides
	};
}

describe('computeStartOrder', () => {
	it('returns empty array for no drivers', () => {
		expect(computeStartOrder([])).toEqual([]);
	});

	it('strips internal sort fields from output', () => {
		const result = computeStartOrder([driver({ id: 1, name: 'Alice' })]);
		expect(result[0]).toEqual({
			id: 1,
			name: 'Alice',
			rfid_tag: 'tag-1',
			class_id: 1,
			class_name: 'A'
		});
	});

	it('orders classes by start_priority descending', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Bob', class_id: 2, class_name: 'B', class_start_priority: 1 }),
			driver({ id: 2, name: 'Alice', class_id: 1, class_name: 'A', class_start_priority: 5 })
		]);
		expect(result.map((d) => d.name)).toEqual(['Alice', 'Bob']);
	});

	it('breaks priority ties by class name ascending', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Bob', class_id: 2, class_name: 'B', class_start_priority: 0 }),
			driver({ id: 2, name: 'Alice', class_id: 1, class_name: 'A', class_start_priority: 0 })
		]);
		expect(result.map((d) => d.class_name)).toEqual(['A', 'B']);
	});

	it('keeps all drivers of one class together before the next class starts', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Alice', class_id: 1, class_name: 'A', class_start_priority: 5 }),
			driver({ id: 2, name: 'Bob', class_id: 2, class_name: 'B', class_start_priority: 1 }),
			driver({ id: 3, name: 'Carol', class_id: 1, class_name: 'A', class_start_priority: 5 }),
			driver({ id: 4, name: 'Dan', class_id: 2, class_name: 'B', class_start_priority: 1 })
		]);
		expect(result.map((d) => d.class_name)).toEqual(['A', 'A', 'B', 'B']);
	});

	it('within a class, ranked drivers go first, unranked follow sorted by name', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Charlie', total_ms: 210000 }),
			driver({ id: 2, name: 'Bob', total_ms: null }),
			driver({ id: 3, name: 'Alice', total_ms: null })
		]);
		expect(result.map((d) => d.name)).toEqual(['Charlie', 'Alice', 'Bob']);
	});

	it('within a class, ranked drivers lead fastest first (leader first)', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Alice', total_ms: 210000 }),
			driver({ id: 2, name: 'Bob', total_ms: 250000 }),
			driver({ id: 3, name: 'Carol', total_ms: 230000 })
		]);
		expect(result.map((d) => d.name)).toEqual(['Alice', 'Carol', 'Bob']);
	});

	it('breaks equal total_ms ties by name ascending', () => {
		const result = computeStartOrder([
			driver({ id: 1, name: 'Bob', total_ms: 210000 }),
			driver({ id: 2, name: 'Alice', total_ms: 210000 })
		]);
		expect(result.map((d) => d.name)).toEqual(['Alice', 'Bob']);
	});

	it('Norway rally — Group A (priority 5) starts before Group N (priority 1); within each, fastest first then unranked', () => {
		const drivers: StartOrderDriver[] = [
			driver({
				id: 1,
				name: 'Alice',
				class_id: 1,
				class_name: 'A',
				class_start_priority: 5,
				total_ms: 440000
			}),
			driver({
				id: 2,
				name: 'Diana',
				class_id: 1,
				class_name: 'A',
				class_start_priority: 5,
				total_ms: 423000
			}),
			driver({
				id: 3,
				name: 'Erik',
				class_id: 1,
				class_name: 'A',
				class_start_priority: 5,
				total_ms: null
			}),
			driver({
				id: 4,
				name: 'Liam',
				class_id: 2,
				class_name: 'N',
				class_start_priority: 1,
				total_ms: 510000
			}),
			driver({
				id: 5,
				name: 'Mia',
				class_id: 2,
				class_name: 'N',
				class_start_priority: 1,
				total_ms: null
			})
		];
		const result = computeStartOrder(drivers);
		expect(result.map((d) => d.name)).toEqual(['Diana', 'Alice', 'Erik', 'Liam', 'Mia']);
	});

	it('does not mutate the input array', () => {
		const input: StartOrderDriver[] = [
			driver({ id: 1, name: 'Bob', class_start_priority: 1 }),
			driver({ id: 2, name: 'Alice', class_start_priority: 5 })
		];
		const snapshot = input.map((d) => d.id);
		computeStartOrder(input);
		expect(input.map((d) => d.id)).toEqual(snapshot);
	});
});
