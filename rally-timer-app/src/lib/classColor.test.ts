import { describe, it, expect } from 'vitest';

import { classChipClass, classColorIndex } from './classColor';

describe('classChipClass', () => {
	it('is stable for the same name', () => {
		expect(classChipClass('Group A')).toBe(classChipClass('Group A'));
		expect(classChipClass(' Group A ')).toBe(classChipClass('Group A'));
	});

	it('gives Group A, B and S distinct colours', () => {
		const idx = ['Group A', 'Group B', 'Group S'].map(classColorIndex);
		expect(new Set(idx).size).toBe(3);
	});

	it('returns no colour for a missing class', () => {
		expect(classChipClass(null)).toBe('');
		expect(classChipClass(undefined)).toBe('');
		expect(classChipClass('')).toBe('');
	});
});
