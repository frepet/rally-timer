import { describe, expect, it } from 'vitest';

import { rssiDeltaClass } from './rssiColor';

describe('rssiDeltaClass', () => {
	it('adds no class for normal or stronger reads so the text colour is unchanged', () => {
		expect(rssiDeltaClass(3)).toBe('');
		expect(rssiDeltaClass(-4)).toBe('');
		expect(rssiDeltaClass(null)).toBe('');
	});

	it('uses a distinct colour per weakness level', () => {
		expect(rssiDeltaClass(-6)).toContain('text-yellow-');
		expect(rssiDeltaClass(-9)).toContain('text-orange-');
		expect(rssiDeltaClass(-14)).toContain('text-red-');
	});
});
