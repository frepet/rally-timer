import { describe, it, expect } from 'vitest';
import { positionToPoints } from './scoring';

describe('positionToPoints', () => {
	it('sole starter (P1 of 1) gets 1 point', () => {
		expect(positionToPoints(1, 1)).toBe(1);
	});

	it('1st out of 3 gets 3 points', () => {
		expect(positionToPoints(1, 3)).toBe(3);
	});

	it('2nd out of 3 gets 2 points', () => {
		expect(positionToPoints(2, 3)).toBe(2);
	});

	it('3rd (last) out of 3 gets 1 point', () => {
		expect(positionToPoints(3, 3)).toBe(1);
	});

	it('1st out of 10 gets 10 points', () => {
		expect(positionToPoints(1, 10)).toBe(10);
	});

	it('last out of 10 gets 1 point', () => {
		expect(positionToPoints(10, 10)).toBe(1);
	});

	it('returns 0 for position greater than total drivers', () => {
		expect(positionToPoints(11, 10)).toBe(0);
	});

	it('returns 0 for position 0 or negative', () => {
		expect(positionToPoints(0, 5)).toBe(0);
		expect(positionToPoints(-1, 5)).toBe(0);
	});

	it('returns 0 for zero or negative totalDrivers', () => {
		expect(positionToPoints(1, 0)).toBe(0);
		expect(positionToPoints(1, -1)).toBe(0);
	});
});
