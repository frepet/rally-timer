import { beforeEach, describe, expect, it } from 'vitest';

import {
	family,
	gateHeartbeats,
	gatePassRssi,
	gatePasses,
	renderCounters,
	renderDomainState,
	renderHistograms,
	renderMetrics,
	resetCounters,
	snapshotProcess,
	submissions
} from './metrics';

describe('renderMetrics', () => {
	const text = renderMetrics({
		startTimeSeconds: 1700000000,
		residentMemoryBytes: 1234,
		heapUsedBytes: 99,
		cpuSecondsTotal: 1.5
	});

	it('exposes the up gauge and process metrics in exposition format', () => {
		expect(text).toContain('# TYPE rally_timer_up gauge\nrally_timer_up 1\n');
		expect(text).toContain('process_start_time_seconds 1700000000\n');
		expect(text).toContain('process_resident_memory_bytes 1234\n');
		expect(text).toContain(
			'# TYPE process_cpu_seconds_total counter\nprocess_cpu_seconds_total 1.5\n'
		);
	});

	it('emits one HELP and TYPE line per metric and ends with a newline', () => {
		const lines = text.trimEnd().split('\n');
		expect(lines.filter((l) => l.startsWith('# HELP')).length).toBe(5);
		expect(lines.filter((l) => l.startsWith('# TYPE')).length).toBe(5);
		expect(text.endsWith('\n')).toBe(true);
	});
});

describe('snapshotProcess', () => {
	it('returns finite, positive values', () => {
		const s = snapshotProcess();
		for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
		expect(s.residentMemoryBytes).toBeGreaterThan(0);
	});
});

describe('family', () => {
	it('escapes label values', () => {
		const text = family('m', 'gauge', 'h', [{ labels: { name: 'a"b\\c\nd' }, value: 1 }]);
		expect(text).toContain('m{name="a\\"b\\\\c\\nd"} 1\n');
	});
});

describe('counters', () => {
	beforeEach(resetCounters);

	it('accumulates per label set', () => {
		gatePasses.inc({ gate_id: 'g1', result: 'stored' });
		gatePasses.inc({ gate_id: 'g1', result: 'stored' });
		gatePasses.inc({ gate_id: 'g1', result: 'duplicate' });
		gateHeartbeats.inc({ gate_id: 'g1' }, 3);
		const text = renderCounters();
		expect(text).toContain('rally_timer_gate_passes_total{gate_id="g1",result="stored"} 2\n');
		expect(text).toContain('rally_timer_gate_passes_total{gate_id="g1",result="duplicate"} 1\n');
		expect(text).toContain('rally_timer_gate_heartbeats_total{gate_id="g1"} 3\n');
	});

	it('lists every counter family even before any increment', () => {
		const text = renderCounters();
		expect(text).toContain('# TYPE rally_timer_gate_passes_total counter\n');
		expect(text).toContain('# TYPE rally_timer_submissions_total counter\n');
		expect(text).not.toMatch(/^rally_timer_\w+(\{.*\})? \d/m);
	});

	it('counts submissions by type', () => {
		submissions.inc({ type: 'rallycross' });
		expect(renderCounters()).toContain('rally_timer_submissions_total{type="rallycross"} 1\n');
	});
});

describe('renderDomainState', () => {
	it('renders gate last-seen in seconds and event counts by state', () => {
		const text = renderDomainState({
			gates: [
				{ id: 'g1', name: 'Start', lastSeenMs: 1700000000500 },
				{ id: 'g2', name: null, lastSeenMs: 1700000001000 }
			],
			events: [
				{ type: 'rally', locked: true, count: 4 },
				{ type: 'training', locked: false, count: 1 }
			]
		});
		expect(text).toContain(
			'rally_timer_gate_last_seen_timestamp_seconds{gate_id="g1",name="Start"} 1700000000.5\n'
		);
		expect(text).toContain(
			'rally_timer_gate_last_seen_timestamp_seconds{gate_id="g2",name=""} 1700000001\n'
		);
		expect(text).toContain('rally_timer_events{type="rally",state="locked"} 4\n');
		expect(text).toContain('rally_timer_events{type="training",state="open"} 1\n');
	});
});

describe('rssi histogram', () => {
	beforeEach(resetCounters);

	it('declares the family even before any observation', () => {
		expect(renderHistograms()).toContain('# TYPE rally_timer_gate_pass_rssi_dbm histogram\n');
		expect(renderHistograms()).not.toContain('_bucket');
	});

	it('buckets negative dBm values cumulatively with sum and count', () => {
		gatePassRssi.observe({ gate_id: 'g1' }, -72); // le -70
		gatePassRssi.observe({ gate_id: 'g1' }, -50); // le -50 (boundary is inclusive)
		gatePassRssi.observe({ gate_id: 'g1' }, -95); // le -90
		gatePassRssi.observe({ gate_id: 'g1' }, -10); // +Inf only
		const text = renderHistograms();
		const bucket = (le: string) =>
			text.match(
				new RegExp(`_bucket\\{gate_id="g1",le="${le.replace('+', '\\+')}"\\} (\\d+)`)
			)?.[1];
		expect(bucket('-90')).toBe('1');
		expect(bucket('-75')).toBe('1');
		expect(bucket('-70')).toBe('2');
		expect(bucket('-55')).toBe('2');
		expect(bucket('-50')).toBe('3');
		expect(bucket('-30')).toBe('3');
		expect(bucket('+Inf')).toBe('4');
		expect(text).toContain('rally_timer_gate_pass_rssi_dbm_sum{gate_id="g1"} -227\n');
		expect(text).toContain('rally_timer_gate_pass_rssi_dbm_count{gate_id="g1"} 4\n');
	});

	it('keeps gates separate', () => {
		gatePassRssi.observe({ gate_id: 'a' }, -60);
		gatePassRssi.observe({ gate_id: 'b' }, -60);
		const text = renderHistograms();
		expect(text).toContain('rally_timer_gate_pass_rssi_dbm_count{gate_id="a"} 1\n');
		expect(text).toContain('rally_timer_gate_pass_rssi_dbm_count{gate_id="b"} 1\n');
	});
});
