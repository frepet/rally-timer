<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '$lib/kcFetch';
	import { startLiveRefresh } from '$lib/liveRefresh';
	import type { BundleResponse } from '$lib/types';
	import RallyResults from '$lib/RallyResults.svelte';
	import RallycrossLeaderboard from '$lib/RallycrossLeaderboard.svelte';
	import TrainingResults from '$lib/TrainingResults.svelte';
	import { buildStageData, buildRallyRows } from '$lib/domain/summary';
	import type { OverallResult } from '$lib/domain/rallycross';
	import { buildRxDisplay } from '$lib/domain/rallycrossDisplay';
	import type { TrainingDriverResult } from '$lib/domain/training';
	import { eventApiUrl, type DisplayEvent } from '$lib/domain/eventPresentation';
	import { t } from '$lib/stores/locale.svelte';

	let { event }: { event: DisplayEvent } = $props();
	const activeView = $derived(event.type);
	type RallycrossConfig = {
		heats: { id: number; started_at: number | null; closed_at: number | null }[];
		active_heat: { number: number } | null;
	};

	type TrainingConfig = {
		gate_id: string | null;
		drivers: TrainingDriverResult[];
	};

	let rxConfig = $state<RallycrossConfig>({ heats: [], active_heat: null });
	let rxLeaderboard = $state<OverallResult[]>([]);
	let trainingConfig = $state<TrainingConfig>({ gate_id: null, drivers: [] });

	let bundle = $state<BundleResponse>({
		drivers: [],
		stages: [],
		start_events: [],
		finish_events: []
	});

	const stageData = $derived(
		buildStageData(bundle.drivers, bundle.stages, bundle.start_events, bundle.finish_events)
	);
	const rallyRows = $derived(buildRallyRows(stageData));

	const rxDisplay = $derived(buildRxDisplay(rxLeaderboard));

	async function loadAll() {
		if (event.type === 'rally') {
			const res = await kcFetch(eventApiUrl('/api/bundle', event.id));
			if (res.ok) bundle = await res.json();
		} else if (event.type === 'training') {
			const res = await kcFetch(eventApiUrl('/api/training', event.id));
			if (res.ok) trainingConfig = await res.json();
		} else {
			const [rx, board] = await Promise.all([
				kcFetch(eventApiUrl('/api/rallycross', event.id)),
				kcFetch(eventApiUrl('/api/rallycross/leaderboard', event.id))
			]);
			if (rx.ok) rxConfig = await rx.json();
			if (board.ok) rxLeaderboard = await board.json();
		}
	}

	let stopLive: (() => void) | null = null;

	onMount(async () => {
		await loadAll();
		stopLive = startLiveRefresh(loadAll, 10000, event.id);
	});
	onDestroy(() => {
		stopLive?.();
	});
</script>

<div class="w-full space-y-8 p-5">
	<div class="mx-auto w-full max-w-5xl">
		{#if activeView === 'training'}
			<div class="mb-4 flex items-center gap-3">
				<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
					{t.trainingHeading}
				</p>
			</div>
			<div class="space-y-6">
				<TrainingResults drivers={trainingConfig.drivers} />
			</div>
		{:else if activeView === 'rallycross'}
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
		{:else}
			<RallyResults {rallyRows} stages={stageData} />
		{/if}
	</div>
</div>
