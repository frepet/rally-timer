/** Prometheus text exposition — no deps. Counters are per process; Prometheus sums replicas. */
type Labels = Record<string, string>;
type Sample = { labels?: Labels; value: number };

const escapeLabel = (v: string) =>
	v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

function formatLabels(labels?: Labels): string {
	const entries = Object.entries(labels ?? {});
	if (entries.length === 0) return '';
	return `{${entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`;
}

export function family(
	name: string,
	type: 'gauge' | 'counter',
	help: string,
	samples: Sample[]
): string {
	const lines = samples.map((s) => `${name}${formatLabels(s.labels)} ${s.value}\n`);
	return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${lines.join('')}`;
}

// --- counters -------------------------------------------------------------

interface Counter {
	inc(labels?: Labels, by?: number): void;
}

const registry = new Map<string, { help: string; series: Map<string, Sample> }>();

function counter(name: string, help: string): Counter {
	const series = new Map<string, Sample>();
	registry.set(name, { help, series });
	return {
		inc(labels = {}, by = 1) {
			const key = formatLabels(labels);
			const existing = series.get(key);
			if (existing) existing.value += by;
			else series.set(key, { labels, value: by });
		}
	};
}

// --- histograms -----------------------------------------------------------

interface Histogram {
	observe(labels: Labels, value: number): void;
}

interface HistogramSeries {
	labels: Labels;
	counts: number[]; // per finite bucket, non-cumulative; the last slot is +Inf
	sum: number;
}

const histograms = new Map<
	string,
	{ help: string; buckets: number[]; series: Map<string, HistogramSeries> }
>();

function histogram(name: string, help: string, buckets: number[]): Histogram {
	const series = new Map<string, HistogramSeries>();
	histograms.set(name, { help, buckets, series });
	return {
		observe(labels, value) {
			const key = formatLabels(labels);
			let s = series.get(key);
			if (!s) {
				s = { labels, counts: new Array(buckets.length + 1).fill(0), sum: 0 };
				series.set(key, s);
			}
			const i = buckets.findIndex((upper) => value <= upper);
			s.counts[i === -1 ? buckets.length : i]++;
			s.sum += value;
		}
	};
}

export function renderHistograms(): string {
	return [...histograms.entries()]
		.map(([name, { help, buckets, series }]) => {
			const lines: string[] = [];
			for (const s of series.values()) {
				let cumulative = 0;
				[...buckets, Infinity].forEach((upper, i) => {
					cumulative += s.counts[i];
					const le = upper === Infinity ? '+Inf' : String(upper);
					lines.push(`${name}_bucket${formatLabels({ ...s.labels, le })} ${cumulative}\n`);
				});
				lines.push(`${name}_sum${formatLabels(s.labels)} ${s.sum}\n`);
				lines.push(`${name}_count${formatLabels(s.labels)} ${cumulative}\n`);
			}
			return `# HELP ${name} ${help}\n# TYPE ${name} histogram\n${lines.join('')}`;
		})
		.join('');
}

/** Outcome: stored | duplicate | failed | unknown_gate. */
export const gatePasses = counter(
	'rally_timer_gate_passes_total',
	'Gate passes received, by gate and outcome.'
);
export const gateHeartbeats = counter(
	'rally_timer_gate_heartbeats_total',
	'Gate heartbeats received, by gate.'
);
/** Type: rally | training | rallycross. */
export const submissions = counter(
	'rally_timer_submissions_total',
	'Events submitted to championships, by event type.'
);

/** Signal strength (dBm, negative) of stored passes that report it. */
export const gatePassRssi = histogram(
	'rally_timer_gate_pass_rssi_dbm',
	'RSSI of stored gate passes in dBm, by gate.',
	[-90, -80, -75, -70, -65, -60, -55, -50, -45, -40, -30]
);

export function renderCounters(): string {
	return [...registry.entries()]
		.map(([name, { help, series }]) => family(name, 'counter', help, [...series.values()]))
		.join('');
}

/** Test helper. */
export function resetCounters(): void {
	for (const { series } of registry.values()) series.clear();
	for (const { series } of histograms.values()) series.clear();
}

// --- process --------------------------------------------------------------

export interface ProcessSnapshot {
	startTimeSeconds: number;
	residentMemoryBytes: number;
	heapUsedBytes: number;
	cpuSecondsTotal: number;
}

export function snapshotProcess(): ProcessSnapshot {
	const cpu = process.cpuUsage();
	return {
		startTimeSeconds: Math.floor(Date.now() / 1000 - process.uptime()),
		residentMemoryBytes: process.memoryUsage().rss,
		heapUsedBytes: process.memoryUsage().heapUsed,
		cpuSecondsTotal: (cpu.user + cpu.system) / 1e6
	};
}

export function renderMetrics(s: ProcessSnapshot): string {
	const one = (name: string, type: 'gauge' | 'counter', help: string, value: number) =>
		family(name, type, help, [{ value }]);
	return (
		one('rally_timer_up', 'gauge', 'The app is serving requests.', 1) +
		one(
			'process_start_time_seconds',
			'gauge',
			'Start time of the process since the unix epoch.',
			s.startTimeSeconds
		) +
		one(
			'process_resident_memory_bytes',
			'gauge',
			'Resident memory size in bytes.',
			s.residentMemoryBytes
		) +
		one('nodejs_heap_used_bytes', 'gauge', 'V8 heap used in bytes.', s.heapUsedBytes) +
		one(
			'process_cpu_seconds_total',
			'counter',
			'Total user and system CPU time spent in seconds.',
			s.cpuSecondsTotal
		)
	);
}

// --- domain gauges (read from the database at scrape time) ----------------

export interface DomainState {
	gates: { id: string; name: string | null; lastSeenMs: number }[];
	events: { type: string; locked: boolean; count: number }[];
}

export function renderDomainState(d: DomainState): string {
	return (
		family(
			'rally_timer_gate_last_seen_timestamp_seconds',
			'gauge',
			'Unix time a gate last sent a pass or heartbeat.',
			d.gates.map((g) => ({
				labels: { gate_id: g.id, name: g.name ?? '' },
				value: g.lastSeenMs / 1000
			}))
		) +
		family(
			'rally_timer_events',
			'gauge',
			'Events by type and state (open or locked, i.e. submitted).',
			d.events.map((e) => ({
				labels: { type: e.type, state: e.locked ? 'locked' : 'open' },
				value: e.count
			}))
		)
	);
}
