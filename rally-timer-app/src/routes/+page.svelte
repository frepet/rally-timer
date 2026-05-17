<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../lib/kcFetch';
	import type { BundleResponse } from '../lib/types';
	import RallyResults from '../lib/RallyResults.svelte';
	import RallycrossLeaderboard from '../lib/RallycrossLeaderboard.svelte';
	import { type DisplayRallyRow, type StageData } from '../lib/results';
	import { buildStageData, buildRallyRows } from '../lib/domain/summary';
	import type { OverallResult } from '../lib/domain/rallycross';
	import { buildRxDisplay } from '../lib/domain/rallycrossDisplay';
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
	const rxDisplay = $derived(buildRxDisplay(rxLeaderboard));

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
					<span
						class="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
					>
						{t.rxStatusHeatInProgress(rxConfig.active_heat.number)}
					</span>
				{/if}
			</div>

			{#if rxLeaderboard.length}
				<RallycrossLeaderboard standings={rxDisplay.standings} heats={rxDisplay.heats} />
			{:else}
				<p class="text-sm text-gray-500">{t.rxWaitingForHeats}</p>
			{/if}
		</div>
	{:else}
		<RallyResults {rallyRows} stages={stageData} />
	{/if}
</div>
