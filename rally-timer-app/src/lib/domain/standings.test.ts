import { describe, it, expect } from 'vitest';
import { calculateStandings } from './standings';
import { positionToPoints } from './scoring';

const ranked = (
	driver_uuid: string,
	driver_name: string,
	class_name: string,
	rally_id: string,
	rally_name: string,
	position: number,
	class_id = 1
) => ({ driver_uuid, driver_name, class_id, class_name, rally_id, rally_name, position });

describe('calculateStandings', () => {
	it('returns empty array for no ranked rows', () => {
		expect(calculateStandings([], positionToPoints)).toEqual([]);
	});

	it('gives 1 point to the sole driver who finished P1 of 1', () => {
		const result = calculateStandings(
			[ranked('uuid-1', 'Alice', 'A', 'rally-1', 'Norway', 1)],
			positionToPoints
		);
		expect(result).toHaveLength(1);
		expect(result[0].driver_uuid).toBe('uuid-1');
		expect(result[0].total_points).toBe(1);
	});

	it('gives 0 points for position exceeding starter count', () => {
		// 1 entry in ranked means N=1 for this rally+class; position 11 > 1 → 0 pts
		const result = calculateStandings(
			[ranked('uuid-1', 'Alice', 'A', 'rally-1', 'Norway', 11)],
			positionToPoints
		);
		expect(result[0].total_points).toBe(0);
	});

	it('accumulates points across multiple rallies for the same driver', () => {
		const result = calculateStandings(
			[
				ranked('uuid-1', 'Alice', 'A', 'rally-1', 'Norway', 1), // N=2, P1 → 2 pts
				ranked('uuid-2', 'Bob', 'A', 'rally-1', 'Norway', 2), // needed to make N=2
				ranked('uuid-1', 'Alice', 'A', 'rally-2', 'Sweden', 2), // N=2, P2 → 1 pt
				ranked('uuid-2', 'Bob', 'A', 'rally-2', 'Sweden', 1) // needed to make N=2
			],
			positionToPoints
		);
		const alice = result.find((r) => r.driver_uuid === 'uuid-1')!;
		expect(alice.total_points).toBe(3);
		expect(alice.rally_points).toHaveLength(2);
	});

	it('includes per-rally breakdown in rally_points', () => {
		const result = calculateStandings(
			[ranked('uuid-1', 'Alice', 'A', 'rally-1', 'Norway', 1)],
			positionToPoints
		);
		expect(result[0].rally_points[0]).toEqual({
			rally_id: 'rally-1',
			rally_name: 'Norway',
			points: 1, // N=1, P1 → 1 point
			position: 1
		});
	});

	it('handles multiple drivers independently', () => {
		const result = calculateStandings(
			[
				ranked('uuid-1', 'Alice', 'A', 'rally-1', 'Norway', 1), // N=2, P1 → 2 pts
				ranked('uuid-2', 'Bob', 'A', 'rally-1', 'Norway', 2) // N=2, P2 → 1 pt
			],
			positionToPoints
		);
		expect(result).toHaveLength(2);
		const alice = result.find((r) => r.driver_uuid === 'uuid-1');
		const bob = result.find((r) => r.driver_uuid === 'uuid-2');
		expect(alice?.total_points).toBe(2);
		expect(bob?.total_points).toBe(1);
	});

	it('groups output by class_name then sorts by total_points desc within class', () => {
		const result = calculateStandings(
			[
				ranked('uuid-1', 'Alice', 'ClassA', 'rally-1', 'Norway', 2), // N=2 ClassA, P2 → 1 pt
				ranked('uuid-2', 'Bob', 'ClassA', 'rally-1', 'Norway', 1), // N=2 ClassA, P1 → 2 pts
				ranked('uuid-3', 'Carol', 'ClassB', 'rally-1', 'Norway', 1) // N=1 ClassB, P1 → 1 pt
			],
			positionToPoints
		);
		// ClassA drivers should be sorted: Bob (2) before Alice (1)
		const classA = result.filter((r) => r.class_name === 'ClassA');
		expect(classA[0].driver_name).toBe('Bob');
		expect(classA[1].driver_name).toBe('Alice');
	});

	it('preserves driver metadata in output', () => {
		const result = calculateStandings(
			[ranked('uuid-42', 'Diana', 'GroupB', 'rally-1', 'Norway', 1, 7)],
			positionToPoints
		);
		expect(result[0]).toMatchObject({
			driver_uuid: 'uuid-42',
			driver_name: 'Diana',
			class_id: 7,
			class_name: 'GroupB'
		});
	});
});
