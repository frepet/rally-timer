<script lang="ts">
	import { Input, Toggle } from 'flowbite-svelte';
	import type { TrainingDriverResult } from './domain/training';
	import { buildTrackDevelopment, buildTrainingChartSeries } from './domain/trainingChart';
	import { formatMs } from './results';
	import { getLocale, t } from './stores/locale.svelte';

	let { drivers }: { drivers: TrainingDriverResult[] } = $props();
	let filterEnabled = $state(true);
	let slowerPercent = $state(50);
	let hiddenDriverIds = $state<number[]>([]);
	let container = $state<HTMLDivElement | null>(null);
	let width = $state(900);

	const height = 360;
	const margin = { top: 18, right: 18, bottom: 48, left: 68 };
	const series = $derived(
		buildTrainingChartSeries(drivers, filterEnabled ? Math.max(0, slowerPercent || 0) : null)
	);
	const visibleSeries = $derived(
		series.filter((entry) => !hiddenDriverIds.includes(entry.driver_id))
	);
	const trackDevelopment = $derived(buildTrackDevelopment(series));
	const trackDevelopmentRows = $derived.by(() => {
		const startTimestamp = trackDevelopment.at(0)?.start_timestamp;
		const endTimestamp = trackDevelopment.at(-1)?.end_timestamp;
		if (startTimestamp === undefined || endTimestamp === undefined) return [];
		return series.map((entry) => ({
			driver_id: entry.driver_id,
			driver_name: entry.driver_name,
			intervals: buildTrackDevelopment([entry], { startTimestamp, endTimestamp })
		}));
	});
	const points = $derived(visibleSeries.flatMap((entry) => entry.points));
	const excludedCount = $derived(
		visibleSeries.reduce((sum, entry) => sum + entry.excluded_count, 0)
	);

	const bounds = $derived.by(() => {
		if (points.length === 0) return null;
		let minTime =
			trackDevelopment.at(0)?.start_timestamp ??
			Math.min(...points.map((point) => point.timestamp));
		let maxTime =
			trackDevelopment.at(-1)?.end_timestamp ?? Math.max(...points.map((point) => point.timestamp));
		let minLap = Math.min(...points.map((point) => point.lap_ms));
		let maxLap = Math.max(...points.map((point) => point.lap_ms));
		const lapPad = minLap === maxLap ? Math.max(1000, minLap * 0.05) : (maxLap - minLap) * 0.08;
		minLap = Math.max(0, minLap - lapPad);
		maxLap += lapPad;
		return { minTime, maxTime, minLap, maxLap };
	});

	const plotWidth = $derived(Math.max(1, width - margin.left - margin.right));
	const plotHeight = height - margin.top - margin.bottom;
	const xTicks = $derived(
		trackDevelopment.length > 0
			? [
					...trackDevelopment.map((interval) => interval.start_timestamp),
					trackDevelopment.at(-1)!.end_timestamp
				]
			: makeTicks(bounds?.minTime ?? 0, bounds?.maxTime ?? 1, width < 600 ? 4 : 7)
	);
	const yTicks = $derived(makeTicks(bounds?.minLap ?? 0, bounds?.maxLap ?? 1, 5));

	function makeTicks(min: number, max: number, count: number): number[] {
		if (count <= 1) return [min];
		return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
	}

	function x(timestamp: number): number {
		if (!bounds) return margin.left;
		return (
			margin.left + ((timestamp - bounds.minTime) / (bounds.maxTime - bounds.minTime)) * plotWidth
		);
	}

	function y(lapMs: number): number {
		if (!bounds) return margin.top;
		return margin.top + ((bounds.maxLap - lapMs) / (bounds.maxLap - bounds.minLap)) * plotHeight;
	}

	function seriesColor(index: number): string {
		return `var(--training-chart-${(index % 8) + 1})`;
	}

	function trackHeatColor(intensity: number | null): string {
		if (intensity === null) return 'var(--color-surface-200)';
		return `hsl(${120 * (1 - intensity)} 72% 42%)`;
	}

	function toggleDriver(driverId: number): void {
		hiddenDriverIds = hiddenDriverIds.includes(driverId)
			? hiddenDriverIds.filter((id) => id !== driverId)
			: [...hiddenDriverIds, driverId];
	}

	function formatClock(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString(getLocale() === 'sv' ? 'sv-SE' : 'en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function formatClockWithSeconds(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString(getLocale() === 'sv' ? 'sv-SE' : 'en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	$effect(() => {
		if (!container) return;
		const updateWidth = () => (width = Math.max(320, Math.round(container?.clientWidth ?? 900)));
		updateWidth();
		const observer = new ResizeObserver(updateWidth);
		observer.observe(container);
		return () => observer.disconnect();
	});
</script>

{#if series.length}
	<section class="panel training-chart">
		<div class="panel-head">
			<div>
				<h2 class="panel-title">{t.trainingChartTitle}</h2>
				<p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
					{t.trainingChartSubtitle}
				</p>
			</div>
			<div class="flex flex-wrap items-end gap-3">
				<Toggle bind:checked={filterEnabled}>{t.trainingChartFilter}</Toggle>
				<label class="block w-28">
					<span class="field-label">{t.trainingChartThreshold}</span>
					<div class="flex items-center gap-1">
						<Input
							type="number"
							min="0"
							step="5"
							bind:value={slowerPercent}
							disabled={!filterEnabled}
						/>
						<span class="text-sm text-surface-500">%</span>
					</div>
				</label>
			</div>
		</div>

		<div class="panel-body space-y-3">
			<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
				{#each series as entry, index (entry.driver_id)}
					<button
						type="button"
						class="legend-driver inline-flex items-center gap-1.5"
						class:legend-driver--hidden={hiddenDriverIds.includes(entry.driver_id)}
						aria-pressed={!hiddenDriverIds.includes(entry.driver_id)}
						onclick={() => toggleDriver(entry.driver_id)}
					>
						<span class="h-0.5 w-5" style={`background-color: ${seriesColor(index)}`}></span>
						{entry.driver_name}
					</button>
				{/each}
			</div>

			{#if excludedCount > 0 && filterEnabled}
				<p class="text-xs text-surface-500 dark:text-surface-400">
					{t.trainingChartExcluded(excludedCount)}
				</p>
			{/if}

			<div bind:this={container} class="w-full overflow-hidden">
				{#if bounds}
					<svg
						viewBox={`0 0 ${width} ${height}`}
						class="block w-full"
						role="img"
						aria-label={t.trainingChartAriaLabel}
					>
						<rect
							x={margin.left}
							y={margin.top}
							width={plotWidth}
							height={plotHeight}
							class="chart-frame"
						/>
						{#each yTicks as tick (tick)}
							<line
								x1={margin.left}
								x2={width - margin.right}
								y1={y(tick)}
								y2={y(tick)}
								class="chart-grid"
							/>
							<text x={margin.left - 9} y={y(tick) + 4} text-anchor="end" class="chart-label"
								>{(tick / 1000).toFixed(1)}</text
							>
						{/each}
						{#each xTicks as tick (tick)}
							<line
								x1={x(tick)}
								x2={x(tick)}
								y1={margin.top}
								y2={height - margin.bottom}
								class="chart-grid chart-grid--vertical"
							/>
							<text
								x={x(tick)}
								y={height - margin.bottom + 20}
								text-anchor="middle"
								class="chart-label">{formatClock(tick)}</text
							>
						{/each}

						<text
							x={margin.left + plotWidth / 2}
							y={height - 5}
							text-anchor="middle"
							class="chart-axis-title">{t.trainingChartTimeAxis}</text
						>
						<text
							x={15}
							y={margin.top + plotHeight / 2}
							text-anchor="middle"
							transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`}
							class="chart-axis-title">{t.trainingChartLapAxis}</text
						>

						{#each series as entry, index (entry.driver_id)}
							{#if !hiddenDriverIds.includes(entry.driver_id)}
								{#each entry.pace_segments as segment, segmentIndex (`${entry.driver_id}-${segmentIndex}`)}
									<polyline
										points={segment
											.map((point) => `${x(point.timestamp)},${y(point.pace_ms)}`)
											.join(' ')}
										fill="none"
										stroke={seriesColor(index)}
										class="chart-pace"
									>
										<title
											>{entry.driver_name} · {t.trainingChartPace}: {formatMs(
												segment.at(-1)?.pace_ms ?? entry.current_pace_ms
											)}</title
										>
									</polyline>
								{/each}
								{#each entry.points as point (point.gate_event_id)}
									<circle
										cx={x(point.timestamp)}
										cy={y(point.lap_ms)}
										r="2"
										fill={seriesColor(index)}
										class="chart-point"
									>
										<title
											>{entry.driver_name} · {formatMs(point.lap_ms)} · {formatClockWithSeconds(
												point.timestamp
											)}</title
										>
									</circle>
								{/each}
							{/if}
						{/each}
					</svg>
				{/if}
			</div>

			{#if trackDevelopment.length > 0}
				<div class="space-y-1.5 pt-1">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3">
						<h3 class="text-sm font-semibold">{t.trainingTrackDevelopment}</h3>
						<p class="text-xs text-surface-500 dark:text-surface-400">
							{t.trainingTrackDevelopmentDescription}
						</p>
					</div>
					{#each [{ driver_id: null, driver_name: '', intervals: trackDevelopment }, ...trackDevelopmentRows] as row (row.driver_id)}
						<div
							class="grid items-center"
							style={`grid-template-columns: ${margin.left}px minmax(0, 1fr) ${margin.right}px`}
						>
							<span
								class="truncate pr-2 text-right text-xs text-surface-600 dark:text-surface-300"
								title={row.driver_id === null ? t.trainingTrackOverall : row.driver_name}
							>
								{row.driver_id === null ? t.trainingTrackOverall : row.driver_name}
							</span>
							<div
								class="flex h-3 overflow-hidden rounded-full"
								role="img"
								aria-label={`${row.driver_id === null ? t.trainingTrackOverall : row.driver_name}: ${t.trainingTrackDevelopmentDescription}`}
							>
								{#each row.intervals as interval (interval.start_timestamp)}
									<span
										class="min-w-0 flex-1"
										style={`background-color: ${trackHeatColor(interval.intensity)}`}
										title={`${formatClock(interval.start_timestamp)}–${formatClock(interval.end_timestamp)} · ${interval.average_lap_ms === null ? '—' : formatMs(interval.average_lap_ms)}`}
									></span>
								{/each}
							</div>
						</div>
					{/each}
					<div
						class="flex items-center justify-end gap-2 text-xs text-surface-500 dark:text-surface-400"
					>
						<span>{t.trainingTrackFaster}</span>
						<span class="h-1.5 w-20 rounded-full bg-gradient-to-r from-green-600 to-red-600"></span>
						<span>{t.trainingTrackSlower}</span>
					</div>
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.training-chart {
		--training-chart-1: var(--color-primary-600);
		--training-chart-2: var(--color-secondary-600);
		--training-chart-3: #16a34a;
		--training-chart-4: #9333ea;
		--training-chart-5: #dc2626;
		--training-chart-6: #0891b2;
		--training-chart-7: #ca8a04;
		--training-chart-8: #db2777;
	}
	.chart-frame {
		fill: transparent;
		stroke: var(--color-surface-300);
		stroke-width: 1;
	}
	.legend-driver {
		cursor: pointer;
		transition: opacity 150ms ease;
	}
	.legend-driver:hover {
		opacity: 0.7;
	}
	.legend-driver--hidden {
		opacity: 0.35;
		text-decoration: line-through;
	}
	.chart-grid {
		stroke: var(--color-surface-200);
		stroke-width: 1;
	}
	.chart-grid--vertical {
		stroke-dasharray: 2 4;
	}
	.chart-label,
	.chart-axis-title {
		fill: var(--color-surface-600);
		font-family: var(--font-sans);
		font-size: 12px;
	}
	.chart-axis-title {
		font-weight: 600;
	}
	.chart-point {
		stroke: white;
		stroke-width: 1.5;
	}
	.chart-pace {
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 2;
	}
	:global(.dark) .training-chart {
		--training-chart-1: var(--color-primary-400);
		--training-chart-2: var(--color-secondary-400);
		--training-chart-3: #4ade80;
		--training-chart-4: #c084fc;
		--training-chart-5: #f87171;
		--training-chart-6: #22d3ee;
		--training-chart-7: #facc15;
		--training-chart-8: #f472b6;
	}
	:global(.dark) .chart-frame {
		stroke: var(--color-surface-600);
	}
	:global(.dark) .chart-grid {
		stroke: var(--color-surface-750);
	}
	:global(.dark) .chart-label,
	:global(.dark) .chart-axis-title {
		fill: var(--color-surface-400);
	}
	:global(.dark) .chart-point {
		stroke: var(--color-surface-850);
	}
</style>
