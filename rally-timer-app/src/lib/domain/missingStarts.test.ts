import { describe, it, expect } from 'vitest';
import { findMissingStarts } from './missingStarts';

describe('findMissingStarts', () => {
	it('returns empty for no starts', () => {
		expect(findMissingStarts([])).toEqual([]);
	});

	it('returns empty when only one driver and one stage', () => {
		expect(findMissingStarts([{ driver_id: 1, stage_id: 10 }])).toEqual([]);
	});

	it('returns empty when all drivers started all stages', () => {
		expect(
			findMissingStarts([
				{ driver_id: 1, stage_id: 10 },
				{ driver_id: 1, stage_id: 11 },
				{ driver_id: 2, stage_id: 10 },
				{ driver_id: 2, stage_id: 11 }
			])
		).toEqual([]);
	});

	it('finds a single missing start', () => {
		const result = findMissingStarts([
			{ driver_id: 1, stage_id: 10 },
			{ driver_id: 1, stage_id: 11 },
			{ driver_id: 2, stage_id: 10 }
			// driver 2 is missing stage 11
		]);
		expect(result).toEqual([{ driver_id: 2, stage_id: 11 }]);
	});

	it('finds multiple missing starts across different drivers', () => {
		const result = findMissingStarts([
			{ driver_id: 1, stage_id: 10 },
			{ driver_id: 2, stage_id: 11 }
			// driver 1 missing stage 11, driver 2 missing stage 10
		]);
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ driver_id: 1, stage_id: 11 });
		expect(result).toContainEqual({ driver_id: 2, stage_id: 10 });
	});

	it('multiple DNF drivers missing the same stage all get the same missing entry', () => {
		// Three drivers, two stages. Drivers 2 and 3 both missing stage 10.
		// Verifies no +30s compounding: they all need a start, not a chain.
		const result = findMissingStarts([
			{ driver_id: 1, stage_id: 10 },
			{ driver_id: 1, stage_id: 11 },
			{ driver_id: 2, stage_id: 11 },
			{ driver_id: 3, stage_id: 11 }
		]);
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ driver_id: 2, stage_id: 10 });
		expect(result).toContainEqual({ driver_id: 3, stage_id: 10 });
	});

	it('handles three stages with partial participation', () => {
		// Driver A: all three stages. Driver B: only stage 2. Missing: B in 1 and 3.
		const result = findMissingStarts([
			{ driver_id: 1, stage_id: 1 },
			{ driver_id: 1, stage_id: 2 },
			{ driver_id: 1, stage_id: 3 },
			{ driver_id: 2, stage_id: 2 }
		]);
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ driver_id: 2, stage_id: 1 });
		expect(result).toContainEqual({ driver_id: 2, stage_id: 3 });
	});

	it('ignores duplicate starts for the same driver/stage', () => {
		const result = findMissingStarts([
			{ driver_id: 1, stage_id: 10 },
			{ driver_id: 1, stage_id: 10 }, // duplicate
			{ driver_id: 1, stage_id: 11 },
			{ driver_id: 2, stage_id: 10 }
		]);
		expect(result).toEqual([{ driver_id: 2, stage_id: 11 }]);
	});
});
