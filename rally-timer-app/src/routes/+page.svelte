<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../lib/kcFetch';
	import type { BundleResponse } from '../lib/types';
	import RallyResults from '../lib/RallyResults.svelte';
	import { type DisplayRallyRow, type StageData, formatMs } from '../lib/results';
	import { buildStageData, buildRallyRows } from '../lib/domain/summary';
	import type { OverallResult } from '../lib/domain/rallycross';
	import { t } from '../lib/stores/locale.svelte';

	type RallycrossConfig = {
		heats: { id: number; started_at: number | null; closed_at: number | null }[];
		active_heat: { number: number } | null;
	};

	let rallyRows = $state<DisplayRallyRow[]>([]);
	let stageData = $state<StageData[]>([]);
	let rxConfig = $state<RallycrossConfig>({ heats: [], active_heat: null });
	let rxLeaderboard = $state<OverallResult[]>([]);

	let bundle: BundleResponse = { drivers: [], stages: [], start_events: [], finish_events: [] };

	async function loadAll() {
		const [bundleRes, rxRes, boardRes] = await Promise.all([
			kcFetch('/api/bundle'),
			fetch('/api/rallycross'),
			fetch('/api/rallycross/leaderboard')
		]);
		if (bundleRes.ok) bundle = await bundleRes.json();
		if (rxRes.ok) rxConfig = await rxRes.json();
		if (boardRes.ok) rxLeaderboard = await boardRes.json();
		stageData = buildStageData(
			bundle.drivers,
			bundle.stages,
			bundle.start_events,
			bundle.finish_events
		);
		rallyRows = buildRallyRows(stageData);
	}

	const showRallycross = $derived(rxConfig.heats.length > 0);

	let poller: number | null = null;

	onMount(async () => {
		await loadAll();
		poller = window.setInterval(loadAll, 2000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});
</script>

<div class="w-full space-y-8 p-5">
	{#if showRallycross}
		<div class="mx-auto w-full max-w-5xl">
			<div class="mb-2 flex items-center gap-3">
				<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
					{t.rxHeading}
				</p>
				{#if rxConfig.active_heat}
					<span class="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
						{t.rxStatusHeatInProgress(rxConfig.active_heat.number)}
					</span>
				{/if}
			</div>

			{#if rxLeaderboard.length}
				<div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800">
								<th class="px-3 py-2">#</th>
								<th class="px-3 py-2">{t.driverHeader}</th>
								<th class="px-3 py-2 text-right">{t.rxBestTime}</th>
								<th class="px-3 py-2 text-right">{t.rxBestLap}</th>
								<th class="px-3 py-2 text-right">{t.rxHeatColumn}</th>
							</tr>
						</thead>
						<tbody>
							{#each rxLeaderboard as r, i (r.driver_id)}
								{@const bestHeat = r.heat_results.find((h) => h.heat_number === r.best_heat_number)}
								<tr class="border-b border-gray-100 dark:border-gray-800 {i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}">
									<td class="px-3 py-2 font-mono font-semibold text-gray-900 dark:text-white">
										{r.best_total_ms !== null ? i + 1 : '—'}
									</td>
									<td class="px-3 py-2">
										<span class="font-medium text-gray-900 dark:text-white">{r.driver_name}</span>
										<span class="ml-1 text-xs text-gray-400">{r.class_name}</span>
									</td>
									<td class="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
										{formatMs(r.best_total_ms)}
									</td>
									<td class="px-3 py-2 text-right font-mono text-gray-500">
										{formatMs(bestHeat?.best_lap_ms ?? null)}
									</td>
									<td class="px-3 py-2 text-right text-xs text-gray-400">
										{r.best_heat_number !== null ? t.rxHeatLabel(r.best_heat_number) : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-sm text-gray-500">{t.rxWaitingForHeats}</p>
			{/if}
		</div>
	{:else}
		<RallyResults {rallyRows} stages={stageData} />
	{/if}
</div>
