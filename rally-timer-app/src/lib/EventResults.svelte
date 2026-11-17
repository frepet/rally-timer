<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '$lib/kcFetch';
	import { startLiveRefresh } from '$lib/liveRefresh';
	import type { BundleResponse } from '$lib/types';
	import RallyResults from '$lib/RallyResults.svelte';
	import RallycrossLeaderboard from '$lib/RallycrossLeaderboard.svelte';
	import TrainingResults from '$lib/TrainingResults.svelte';
	import { buildStageData, buildRallyRows } from '$lib/domain/summary';
	import type { OverallResult, HeatResult } from '$lib/domain/rallycross';
	import { env } from '$env/dynamic/public';
	import { applyRxRatings, buildRxDisplay, rankHeatEntries } from '$lib/domain/rallycrossDisplay';
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
	let rxLive = $state<{
		heat: { number: number; required_laps: number } | null;
		results: HeatResult[];
	}>({ heat: null, results: [] });
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

	const ratingsEnabled = env.PUBLIC_FEATURE_DRIVER_RATINGS === 'true';
	const rxDisplay = $derived.by(() => {
		const display = buildRxDisplay(rxLeaderboard);
		if (!ratingsEnabled) return display;
		const initial = new Map(
			rxLeaderboard.flatMap((r) =>
				r.driver_uuid && r.rating_before != null ? [[r.driver_uuid, r.rating_before] as const] : []
			)
		);
		return applyRxRatings(display, initial);
	});
	const rxLiveHeat = $derived(
		rxLive.heat
			? {
					number: rxLive.heat.number,
					required_laps: rxLive.heat.required_laps,
					entries: rankHeatEntries(
						rxLive.results.map((r) => ({
							result: r,
							driver_name: r.driver_name,
							class_name: r.class_name
						}))
					)
				}
			: null
	);

	async function loadAll() {
		if (event.type === 'rally') {
			const res = await kcFetch(eventApiUrl('/api/bundle', event.id));
			if (res.ok) bundle = await res.json();
		} else if (event.type === 'training') {
			const res = await kcFetch(eventApiUrl('/api/training', event.id));
			if (res.ok) trainingConfig = await res.json();
		} else {
			const [rx, board, live] = await Promise.all([
				kcFetch(eventApiUrl('/api/rallycross', event.id)),
				kcFetch(eventApiUrl('/api/rallycross/leaderboard', event.id)),
				kcFetch(eventApiUrl('/api/rallycross/live', event.id))
			]);
			if (rx.ok) rxConfig = await rx.json();
			if (board.ok) rxLeaderboard = await board.json();
			if (live.ok) rxLive = await live.json();
		}
	}

	async function deleteTrainingLap(gateEventId: number) {
		if (!confirm(t.trainingDeleteLapConfirm)) return;
		try {
			const res = await kcFetch(eventApiUrl(`/api/training/event/${gateEventId}`, event.id), {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error(await res.text());
			await loadAll();
		} catch (e) {
			alert(t.trainingDeleteLapFailed + (e as Error).message);
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

<div class="page">
	{#if activeView === 'training'}
		<section class="panel">
			<div class="panel-head">
				<h2 class="panel-title">{t.trainingHeading}</h2>
			</div>
			<div class="panel-body space-y-6">
				<TrainingResults drivers={trainingConfig.drivers} onDeleteLap={deleteTrainingLap} />
			</div>
		</section>
	{:else if activeView === 'rallycross'}
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="panel-title">{t.rxHeading}</h2>
			{#if rxConfig.active_heat}
				<span class="chip chip--ok">
					<span class="status-dot status-dot--live"></span>
					{t.rxStatusHeatInProgress(rxConfig.active_heat.number)}
				</span>
			{/if}
		</div>
		{#if rxLeaderboard.length || rxLiveHeat}
			<RallycrossLeaderboard
				standings={rxDisplay.standings}
				heats={rxDisplay.heats}
				live={rxLiveHeat}
				showRatings={ratingsEnabled}
			/>
		{:else}
			<p class="empty dark:text-surface-400">{t.rxWaitingForHeats}</p>
		{/if}
	{:else}
		<RallyResults {rallyRows} stages={stageData} />
	{/if}
</div>
