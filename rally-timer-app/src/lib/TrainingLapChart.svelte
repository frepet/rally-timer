<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Input, Toggle } from 'flowbite-svelte';
	import type { ECharts, EChartsCoreOption } from 'echarts/core';
	import type { TrainingDriverResult } from './domain/training';
	import { buildTrackDevelopment, buildTrainingChartSeries } from './domain/trainingChart';
	import { formatMs } from './results';
	import { getLocale, t } from './stores/locale.svelte';

	type TimeRange = { min: number; max: number };

	let { drivers }: { drivers: TrainingDriverResult[] } = $props();
	let filterEnabled = $state(true);
	let slowerPercent = $state(50);
	// Empty means every driver is shown; otherwise only the listed drivers.
	let selectedDriverIds = $state<number[]>([]);
	let container = $state<HTMLDivElement | null>(null);
	let chart = $state<ECharts | null>(null);
	let isDark = $state(false);
	let view = $state<TimeRange | null>(null);

	const height = 360;
	const margin = { top: 30, right: 18, bottom: 48, left: 68 };
	const series = $derived(
		buildTrainingChartSeries(drivers, filterEnabled ? Math.max(0, slowerPercent || 0) : null)
	);
	const visibleSeries = $derived(series.filter((entry) => isVisible(entry.driver_id)));
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
		if (minTime === maxTime) maxTime = minTime + 1;
		return { minTime, maxTime, minLap, maxLap };
	});
	// The heat strips follow the zoomed window; fall back to the full range.
	const viewRange = $derived<TimeRange | null>(
		view ?? (bounds ? { min: bounds.minTime, max: bounds.maxTime } : null)
	);
	const zoomed = $derived(
		!!view && !!bounds && (view.min > bounds.minTime + 1 || view.max < bounds.maxTime - 1)
	);

	function isVisible(driverId: number): boolean {
		return selectedDriverIds.length === 0 || selectedDriverIds.includes(driverId);
	}

	// Click a name to isolate it, click more to add them, unclick the last to show everyone again.
	function toggleDriver(driverId: number): void {
		if (selectedDriverIds.length === 0) {
			selectedDriverIds = [driverId];
		} else if (selectedDriverIds.includes(driverId)) {
			selectedDriverIds = selectedDriverIds.filter((id) => id !== driverId);
		} else {
			selectedDriverIds = [...selectedDriverIds, driverId];
		}
	}

	function seriesColorName(index: number): string {
		return `--training-chart-${(index % 8) + 1}`;
	}

	function trackHeatColor(intensity: number | null): string {
		if (intensity === null) return 'var(--color-surface-200)';
		return `hsl(${120 * (1 - intensity)} 72% 42%)`;
	}

	function intervalStyle(startTimestamp: number, endTimestamp: number): string {
		if (!viewRange) return '';
		const span = viewRange.max - viewRange.min;
		const left = ((startTimestamp - viewRange.min) / span) * 100;
		const width = ((endTimestamp - startTimestamp) / span) * 100;
		return `left: ${left}%; width: ${width}%;`;
	}

	function formatClock(timestamp: number, withSeconds = false): string {
		return new Date(timestamp).toLocaleTimeString(getLocale() === 'sv' ? 'sv-SE' : 'en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			second: withSeconds ? '2-digit' : undefined,
			hour12: false
		});
	}

	function escapeHtml(text: string): string {
		return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
	}

	// Canvas needs concrete colours, so resolve CSS variables (possibly oklch) to rgb.
	function resolveColor(cssColor: string): string {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return cssColor;
		context.fillStyle = '#000';
		context.fillStyle = cssColor;
		context.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
		return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
	}

	function readView(instance: ECharts): TimeRange | null {
		const option = instance.getOption() as unknown as {
			dataZoom?: { startValue?: number; endValue?: number }[];
		};
		const zoom = option.dataZoom?.[0];
		if (typeof zoom?.startValue !== 'number' || typeof zoom.endValue !== 'number') return null;
		return { min: zoom.startValue, max: zoom.endValue };
	}

	function resetZoom(): void {
		chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
	}

	function buildOption(host: HTMLElement, range: NonNullable<typeof bounds>): EChartsCoreOption {
		const color = (name: string) => resolveColor(getComputedStyle(host).getPropertyValue(name));
		const textColor = color(isDark ? '--color-surface-400' : '--color-surface-600');
		const gridColor = color(isDark ? '--color-surface-750' : '--color-surface-200');
		const frameColor = color(isDark ? '--color-surface-600' : '--color-surface-300');
		const pointBorder = isDark ? color('--color-surface-850') : '#ffffff';
		const axisTitle = { color: textColor, fontWeight: 600, fontSize: 12 };

		const lineSeries: unknown[] = [];
		const pointSeries: unknown[] = [];
		series.forEach((entry, index) => {
			if (!isVisible(entry.driver_id)) return;
			const driverColor = color(seriesColorName(index));
			// A null between segments breaks the line across long pauses.
			const paceData = entry.pace_segments.flatMap((segment, segmentIndex) => [
				...(segmentIndex > 0 ? [[segment[0].timestamp - 1, null]] : []),
				...segment.map((point) => [point.timestamp, point.pace_ms])
			]);
			lineSeries.push({
				id: `pace-${entry.driver_id}`,
				name: entry.driver_name,
				type: 'line',
				data: paceData,
				connectNulls: false,
				symbol: 'circle',
				symbolSize: 10,
				itemStyle: { color: driverColor, opacity: 0 },
				lineStyle: { color: driverColor, width: 2, cap: 'round', join: 'round' },
				emphasis: { itemStyle: { opacity: 1 }, lineStyle: { width: 2 } },
				z: 2,
				meta: 'pace'
			});
			pointSeries.push({
				id: `lap-${entry.driver_id}`,
				name: entry.driver_name,
				type: 'scatter',
				data: entry.points.map((point) => [point.timestamp, point.lap_ms]),
				symbolSize: 6,
				itemStyle: { color: driverColor, borderColor: pointBorder, borderWidth: 1.5 },
				z: 3,
				meta: 'lap'
			});
		});

		return {
			animation: false,
			grid: {
				left: margin.left,
				right: margin.right,
				top: margin.top,
				bottom: margin.bottom,
				show: true,
				borderColor: frameColor
			},
			textStyle: { color: textColor },
			tooltip: {
				trigger: 'item',
				confine: true,
				formatter: (raw: unknown): string => {
					const params = raw as {
						seriesName?: string;
						value?: [number, number];
						componentSubType?: string;
					};
					if (!params.value) return '';
					const [timestamp, ms] = params.value;
					const label =
						params.componentSubType === 'line'
							? `${t.trainingChartPace}: ${formatMs(ms)}`
							: formatMs(ms);
					return `${escapeHtml(params.seriesName ?? '')} · ${label} · ${formatClock(timestamp, true)}`;
				}
			},
			toolbox: {
				right: margin.right,
				top: 0,
				itemSize: 14,
				iconStyle: { borderColor: textColor },
				feature: {
					dataZoom: {
						yAxisIndex: 'none',
						title: { zoom: t.trainingChartZoomSelect, back: t.trainingChartZoomBack }
					}
				}
			},
			dataZoom: [
				{
					type: 'inside',
					xAxisIndex: 0,
					filterMode: 'none',
					zoomOnMouseWheel: 'ctrl',
					moveOnMouseMove: false
				}
			],
			xAxis: {
				type: 'time',
				min: range.minTime,
				max: range.maxTime,
				name: t.trainingChartTimeAxis,
				nameLocation: 'middle',
				nameGap: 30,
				nameTextStyle: axisTitle,
				axisLabel: { color: textColor, formatter: (value: number) => formatClock(value) },
				axisLine: { show: false },
				axisTick: { show: false },
				splitLine: { show: true, lineStyle: { color: gridColor, type: [2, 4] } }
			},
			yAxis: {
				type: 'value',
				min: range.minLap,
				max: range.maxLap,
				splitNumber: 4,
				name: t.trainingChartLapAxis,
				nameLocation: 'middle',
				nameGap: 46,
				nameTextStyle: axisTitle,
				axisLabel: { color: textColor, formatter: (value: number) => (value / 1000).toFixed(1) },
				axisLine: { show: false },
				axisTick: { show: false },
				splitLine: { lineStyle: { color: gridColor } }
			},
			series: [...lineSeries, ...pointSeries]
		};
	}

	// Client-only: ECharts needs the DOM, so it is loaded lazily after mount.
	$effect(() => {
		const host = container;
		if (!host) return;
		let instance: ECharts | null = null;
		let disposed = false;
		let observer: ResizeObserver | null = null;

		(async () => {
			const [core, charts, components, renderers] = await Promise.all([
				import('echarts/core'),
				import('echarts/charts'),
				import('echarts/components'),
				import('echarts/renderers')
			]);
			if (disposed) return;
			core.use([
				charts.LineChart,
				charts.ScatterChart,
				components.GridComponent,
				components.TooltipComponent,
				components.DataZoomComponent,
				components.ToolboxComponent,
				renderers.CanvasRenderer
			]);
			const created = core.init(host, undefined, { height });
			instance = created;
			created.on('datazoom', () => {
				view = readView(created);
			});
			created
				.getZr()
				.on('dblclick', () => created.dispatchAction({ type: 'dataZoom', start: 0, end: 100 }));
			observer = new ResizeObserver(() => created.resize());
			observer.observe(host);
			chart = created;
		})();

		return () => {
			disposed = true;
			observer?.disconnect();
			instance?.dispose();
			chart = null;
			view = null;
		};
	});

	$effect(() => {
		const root = document.documentElement;
		isDark = root.classList.contains('dark');
		const observer = new MutationObserver(() => (isDark = root.classList.contains('dark')));
		observer.observe(root, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!chart || !container || !bounds) return;
		const keepZoom = untrack(() => zoomed);
		// replaceMerge: series that are no longer visible must be removed, not merged.
		chart.setOption(buildOption(container, bounds), { replaceMerge: ['series'] });
		// Plain drag selects a time window instead of requiring the toolbox button first.
		chart.dispatchAction({
			type: 'takeGlobalCursor',
			key: 'dataZoomSelect',
			dataZoomSelectActive: true
		});
		// A live refresh extends the data; follow it unless the user has zoomed in.
		if (!keepZoom) chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
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
						class:legend-driver--hidden={!isVisible(entry.driver_id)}
						aria-pressed={isVisible(entry.driver_id)}
						onclick={() => toggleDriver(entry.driver_id)}
					>
						<span class="h-0.5 w-5" style={`background-color: var(${seriesColorName(index)})`}
						></span>
						{entry.driver_name}
					</button>
				{/each}
			</div>

			{#if excludedCount > 0 && filterEnabled}
				<p class="text-xs text-surface-500 dark:text-surface-400">
					{t.trainingChartExcluded(excludedCount)}
				</p>
			{/if}

			<div
				class="flex items-center justify-between gap-3 text-xs text-surface-500 dark:text-surface-400"
			>
				<p>{t.trainingChartZoomHint}</p>
				{#if zoomed}
					<Button size="xs" color="light" onclick={resetZoom}>{t.trainingChartResetZoom}</Button>
				{/if}
			</div>

			<div
				bind:this={container}
				class="w-full"
				style={`height: ${height}px`}
				role="img"
				aria-label={t.trainingChartAriaLabel}
			></div>

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
								class="relative h-3 overflow-hidden rounded-full"
								role="img"
								aria-label={`${row.driver_id === null ? t.trainingTrackOverall : row.driver_name}: ${t.trainingTrackDevelopmentDescription}`}
							>
								{#each row.intervals as interval (interval.start_timestamp)}
									<span
										class="absolute inset-y-0"
										style={`${intervalStyle(interval.start_timestamp, interval.end_timestamp)} background-color: ${trackHeatColor(interval.intensity)}`}
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
</style>
