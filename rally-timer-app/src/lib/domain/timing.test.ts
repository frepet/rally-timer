import { describe, it, expect } from 'vitest';
import { calculateStageTime } from './timing';

describe('calculateStageTime', () => {
	it('returns elapsed ms between start and finish', () => {
		const starts = [1000];
		const finishes = [5000];
		expect(calculateStageTime(starts, finishes)).toBe(4000);
	});

	it('uses the earliest valid finish when finishes are unsorted', () => {
		const starts = [1000];
		const finishes = [5000, 3000];
		expect(calculateStageTime(starts, finishes)).toBe(2000);
	});

	it('returns null when there are no starts', () => {
		const starts: number[] = [];
		const finishes = [5000];
		expect(calculateStageTime(starts, finishes)).toBeNull();
	});

	it('returns null when there are no finishes', () => {
		const starts = [1000];
		const finishes: number[] = [];
		expect(calculateStageTime(starts, finishes)).toBeNull();
	});
});
