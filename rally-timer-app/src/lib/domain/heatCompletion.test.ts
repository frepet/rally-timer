import { expect, it } from 'vitest';
import { heatIsComplete } from './heatCompletion';
it('waits for every racing driver to finish required laps', () => {
	const entries = [
		{ tag: 'a', ts_ms: 100, dnf: false },
		{ tag: 'b', ts_ms: 100, dnf: false }
	];
	expect(heatIsComplete(entries, [{ tag: 'a', timestamp: 200 }], 1, 0)).toBe(false);
	expect(
		heatIsComplete(
			entries,
			[
				{ tag: 'a', timestamp: 200 },
				{ tag: 'b', timestamp: 300 }
			],
			1,
			0
		)
	).toBe(true);
});
it('ignores DNF entries and passes before driver start', () => {
	expect(
		heatIsComplete(
			[
				{ tag: 'a', ts_ms: 100, dnf: false },
				{ tag: 'b', ts_ms: 100, dnf: true }
			],
			[{ tag: 'a', timestamp: 90 }],
			1,
			0
		)
	).toBe(false);
	expect(
		heatIsComplete(
			[
				{ tag: 'a', ts_ms: 100, dnf: false },
				{ tag: 'b', ts_ms: 100, dnf: true }
			],
			[{ tag: 'a', timestamp: 200 }],
			1,
			0
		)
	).toBe(true);
});
