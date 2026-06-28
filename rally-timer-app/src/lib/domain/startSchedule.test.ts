import { describe, it, expect } from 'vitest';
import { buildStartSchedule } from './startSchedule';
import type { StartOrderEntry } from './startOrder';

function entry(overrides: Partial<StartOrderEntry> & { id: number }): StartOrderEntry {
	return {
		name: `Driver ${overrides.id}`,
		rfid_tag: `tag-${overrides.id}`,
		class_id: 1,
		class_name: 'A',
		...overrides
	};
}

describe('buildStartSchedule', () => {
	it('returns empty array for no drivers', () => {
		expect(buildStartSchedule([], 1000, 10000, false)).toEqual([]);
	});

	it('spaces drivers one gap apart starting at startAtMs', () => {
		const order = [entry({ id: 1 }), entry({ id: 2 }), entry({ id: 3 })];
		expect(buildStartSchedule(order, 1000, 10000, false)).toEqual([
			{ driver_id: 1, ts_ms: 1000 },
			{ driver_id: 2, ts_ms: 11000 },
			{ driver_id: 3, ts_ms: 21000 }
		]);
	});

	it('groups consecutive same-class drivers into one slot when wholeClass', () => {
		const order = [
			entry({ id: 1, class_id: 1 }),
			entry({ id: 2, class_id: 1 }),
			entry({ id: 3, class_id: 2 }),
			entry({ id: 4, class_id: 2 })
		];
		expect(buildStartSchedule(order, 0, 20000, true)).toEqual([
			{ driver_id: 1, ts_ms: 0 },
			{ driver_id: 2, ts_ms: 0 },
			{ driver_id: 3, ts_ms: 20000 },
			{ driver_id: 4, ts_ms: 20000 }
		]);
	});

	it('does not group classes when wholeClass is false', () => {
		const order = [entry({ id: 1, class_id: 1 }), entry({ id: 2, class_id: 1 })];
		expect(buildStartSchedule(order, 0, 10000, false)).toEqual([
			{ driver_id: 1, ts_ms: 0 },
			{ driver_id: 2, ts_ms: 10000 }
		]);
	});
});
