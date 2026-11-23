import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import TrainingLapList from './TrainingLapList.svelte';
import type { TrainingLap } from './domain/training';

const lap = (id: number, rssi: number | null, rssi_delta: number | null): TrainingLap => ({
	gate_event_id: id,
	timestamp: id * 1000,
	lap_ms: 15000,
	rssi,
	rssi_delta
});

function html(laps: TrainingLap[]): string {
	return render(TrainingLapList, {
		props: { laps, bestLapMs: 15000, canDelete: false }
	}).body.replace(/<!--.*?-->/g, '');
}

describe('TrainingLapList RSSI delta', () => {
	it('shows the read followed by a spaced, parenthesised delta', () => {
		expect(html([lap(1, -70, 5)])).toMatch(/-70\s\(<span[^>]*>\+5<\/span>\)/);
		expect(html([lap(1, -70, 0)])).toMatch(/-70\s\(<span[^>]*>±0<\/span>\)/);
	});

	it('leaves ordinary and stronger deltas in the normal text colour', () => {
		const out = html([lap(1, -66, -4), lap(2, -60, 6)]);
		expect(out).not.toMatch(/text-(yellow|orange|red)-/);
	});

	it('colours weaker deltas yellow, orange then red', () => {
		expect(html([lap(1, -75, -5)])).toMatch(/text-yellow-\d+[^>]*>-5</);
		expect(html([lap(1, -78, -8)])).toMatch(/text-orange-\d+[^>]*>-8</);
		expect(html([lap(1, -82, -12)])).toMatch(/text-red-\d+[^>]*>-12</);
	});

	it('shows no parentheses without a delta', () => {
		const out = html([lap(1, -70, null)]);
		expect(out).toContain('-70');
		expect(out).not.toContain('(');
	});

	it('only the delta is coloured, not the read', () => {
		expect(html([lap(1, -82, -12)])).toMatch(/-82\s\(<span class="[^"]*text-red-/);
	});
});
