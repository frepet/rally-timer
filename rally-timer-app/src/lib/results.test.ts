import { describe, it, expect } from 'vitest';

import { formatMs, assignPositionsAndDeltas } from './results';

describe('formatMs', () => {
	it('renders m:ss.cc', () => {
		expect(formatMs(0)).toBe('0:00.00');
		expect(formatMs(1234)).toBe('0:01.23');
		expect(formatMs(61_500)).toBe('1:01.50');
		expect(formatMs(600_000)).toBe('10:00.00');
	});

	it('truncates sub-centisecond, does not round up', () => {
		expect(formatMs(1239)).toBe('0:01.23');
	});

	it('renders null/undefined as a dash', () => {
		expect(formatMs(null)).toBe('—');
		expect(formatMs(undefined)).toBe('—');
	});
});

describe('assignPositionsAndDeltas', () => {
	it('assigns 1-based positions and deltas to pre-sorted rows', () => {
		const rows = [
			{ position: 0, delta_p1: null as number | null, delta_prev: null as number | null, t: 1000 },
			{ position: 0, delta_p1: null as number | null, delta_prev: null as number | null, t: 1500 },
			{ position: 0, delta_p1: null as number | null, delta_prev: null as number | null, t: 2200 }
		];
		assignPositionsAndDeltas(rows, (r) => r.t);
		expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
		expect(rows.map((r) => r.delta_p1)).toEqual([0, 500, 1200]);
		expect(rows.map((r) => r.delta_prev)).toEqual([null, 500, 700]);
	});

	it('is a no-op on an empty list', () => {
		expect(() => assignPositionsAndDeltas([], () => 0)).not.toThrow();
	});
});
