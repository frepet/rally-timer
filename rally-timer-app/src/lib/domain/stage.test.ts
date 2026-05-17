import { describe, it, expect } from 'vitest';
import { countStageEvents } from './stage';

describe('countStageEvents', () => {
	it('sums start and finish counts', () => {
		expect(countStageEvents(3, 5)).toBe(8);
	});

	it('returns 0 with no events', () => {
		expect(countStageEvents(0, 0)).toBe(0);
	});

	it('handles starts only', () => {
		expect(countStageEvents(4, 0)).toBe(4);
	});

	it('handles finishes only', () => {
		expect(countStageEvents(0, 3)).toBe(3);
	});
});
