import { describe, it, expect } from 'vitest';

import { stepStage } from './stagePicker';

const names = ['SS1', 'SS2', 'SS3'];

describe('stepStage', () => {
	it('moves to the neighbouring stage', () => {
		expect(stepStage(names, 'SS2', 1)).toBe('SS3');
		expect(stepStage(names, 'SS2', -1)).toBe('SS1');
	});
	it('stops at the ends instead of wrapping', () => {
		expect(stepStage(names, 'SS3', 1)).toBe('SS3');
		expect(stepStage(names, 'SS1', -1)).toBe('SS1');
	});
	it('falls back to the first stage when the active one is unknown', () => {
		expect(stepStage(names, null, 1)).toBe('SS1');
		expect(stepStage(names, 'gone', -1)).toBe('SS1');
	});
	it('returns null when there are no stages', () => {
		expect(stepStage([], 'SS1', 1)).toBeNull();
	});
});
