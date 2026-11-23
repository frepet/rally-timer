import { describe, expect, it } from 'vitest';

import { MIN_RSSI_SAMPLES, meanRssi, rssiDelta, rssiDeltaLevel, rssiDeltaText } from './rssi';

describe('meanRssi', () => {
	it('averages the reads that have a value', () => {
		expect(meanRssi([-70, -60, null, undefined, -65])).toBeCloseTo(-65);
	});

	it('returns null below the minimum sample count', () => {
		expect(meanRssi([])).toBeNull();
		expect(meanRssi([-70, -60, null])).toBeNull();
		expect(meanRssi(Array(MIN_RSSI_SAMPLES).fill(-70))).toBe(-70);
	});
});

describe('rssiDelta', () => {
	it('is positive for a stronger (less negative) read and rounds to whole dB', () => {
		expect(rssiDelta(-60, -65)).toBe(5);
		expect(rssiDelta(-70, -65)).toBe(-5);
		expect(rssiDelta(-70, -65.3)).toBe(-5);
		expect(rssiDelta(-65, -65.2)).toBe(0);
	});

	it('is null without a read or without an average', () => {
		expect(rssiDelta(null, -65)).toBeNull();
		expect(rssiDelta(-70, null)).toBeNull();
	});
});

describe('rssiDeltaText', () => {
	it('formats with an explicit sign', () => {
		expect(rssiDeltaText(5)).toBe('+5');
		expect(rssiDeltaText(-5)).toBe('-5');
		expect(rssiDeltaText(0)).toBe('±0');
	});

	it('is empty when there is no delta', () => {
		expect(rssiDeltaText(null)).toBe('');
		expect(rssiDeltaText(undefined)).toBe('');
	});
});

describe('rssiDeltaLevel', () => {
	it('leaves stronger, equal and slightly weaker reads uncoloured', () => {
		for (const d of [12, 5, 0, -1, -4]) expect(rssiDeltaLevel(d)).toBe('ok');
		expect(rssiDeltaLevel(null)).toBe('ok');
		expect(rssiDeltaLevel(undefined)).toBe('ok');
	});

	it('steps through yellow, orange and red as the read gets weaker', () => {
		expect(rssiDeltaLevel(-5)).toBe('yellow');
		expect(rssiDeltaLevel(-7)).toBe('yellow');
		expect(rssiDeltaLevel(-8)).toBe('orange');
		expect(rssiDeltaLevel(-11)).toBe('orange');
		expect(rssiDeltaLevel(-12)).toBe('red');
		expect(rssiDeltaLevel(-30)).toBe('red');
	});
});
