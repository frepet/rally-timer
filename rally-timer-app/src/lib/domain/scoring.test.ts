import { describe, it, expect } from 'vitest';
import { positionToPoints, POINTS_TABLE } from './scoring';

describe('POINTS_TABLE', () => {
	it('awards 25 points for 1st place', () => {
		expect(POINTS_TABLE[1]).toBe(25);
	});

	it('awards 18 points for 2nd place', () => {
		expect(POINTS_TABLE[2]).toBe(18);
	});

	it('awards 15 points for 3rd', () => {
		expect(POINTS_TABLE[3]).toBe(15);
	});

	it('awards 1 point for 10th', () => {
		expect(POINTS_TABLE[10]).toBe(1);
	});

	it('has no entry beyond 10th', () => {
		expect(POINTS_TABLE[11]).toBeUndefined();
	});
});

describe('positionToPoints', () => {
	it('returns 25 for 1st', () => {
		expect(positionToPoints(1)).toBe(25);
	});

	it('returns 18 for 2nd', () => {
		expect(positionToPoints(2)).toBe(18);
	});

	it('returns 15, 12, 10, 8, 6, 4, 2, 1 for positions 3–10', () => {
		expect([3, 4, 5, 6, 7, 8, 9, 10].map(positionToPoints)).toEqual([15, 12, 10, 8, 6, 4, 2, 1]);
	});

	it('returns 0 for positions outside the top 10', () => {
		expect(positionToPoints(11)).toBe(0);
		expect(positionToPoints(99)).toBe(0);
	});

	it('returns 0 for position 0 or negative', () => {
		expect(positionToPoints(0)).toBe(0);
		expect(positionToPoints(-1)).toBe(0);
	});
});
