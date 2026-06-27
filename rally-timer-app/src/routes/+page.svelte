<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button, Modal } from 'flowbite-svelte';
	import { kcFetch } from '../lib/kcFetch';
	import { startLiveRefresh } from '../lib/liveRefresh';
	import type { BundleResponse } from '../lib/types';
	import RallyResults from '../lib/RallyResults.svelte';
	import RallycrossLeaderboard from '../lib/RallycrossLeaderboard.svelte';
	import TrainingResults from '../lib/TrainingResults.svelte';
	import { buildStageData, buildRallyRows } from '../lib/domain/summary';
	import type { OverallResult } from '../lib/domain/rallycross';
	import { buildRxDisplay } from '../lib/domain/rallycrossDisplay';
	import type { TrainingDriverResult } from '../lib/domain/training';
	import { formatMs } from '../lib/results';
	import { auth } from '../lib/stores/auth.svelte';
	import { t } from '../lib/stores/locale.svelte';

	type View = 'rally' | 'rallycross' | 'training';

	type RallycrossConfig = {
		heats: { id: number; started_at: number | null; closed_at: number | null }[];
		active_heat: { number: number } | null;
	};

	type TrainingConfig = {
		gate_id: string | null;
		drivers: TrainingDriverResult[];
	};

	// persisted admin choice; null = auto-detect
	let pinnedView = $state<View | null>(null);
	let savingView = $state(false);

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

	// Auto-detect priority: training (gate assigned) → rallycross (heats exist) → rally
	const autoView = $derived<View>(
		trainingConfig.gate_id !== null
			? 'training'
			: rxConfig.heats.length > 0
				? 'rallycross'
				: 'rally'
	);

	const activeView = $derived<View>(pinnedView ?? autoView);

	const rxDisplay = $derived(buildRxDisplay(rxLeaderboard));

	async function loadAll() {
		const [bundleRes, rxRes, boardRes, trainingRes, settingsRes] = await Promise.all([
			kcFetch('/api/bundle'),
			kcFetch('/api/rallycross'),
			kcFetch('/api/rallycross/leaderboard'),
			kcFetch('/api/training'),
			kcFetch('/api/settings')
		]);
		if (bundleRes.ok) bundle = await bundleRes.json();
		if (rxRes.ok) rxConfig = await rxRes.json();
		if (boardRes.ok) rxLeaderboard = await boardRes.json();
		if (trainingRes.ok) trainingConfig = await trainingRes.json();
		if (settingsRes.ok) {
			const s = await settingsRes.json();
			pinnedView = s.pinned_view ?? null;
		}
	}

	async function setPinnedView(view: View | null) {
		savingView = true;
		try {
			await kcFetch('/api/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned_view: view })
			});
			pinnedView = view;
		} finally {
			savingView = false;
		}
	}

	const viewLabel: Record<View, () => string> = {
		rally: () => t.viewRally,
		rallycross: () => t.viewRallycross,
		training: () => t.viewTraining
	};

	let stopLive: (() => void) | null = null;

	onMount(async () => {
		await loadAll();
		stopLive = startLiveRefresh(loadAll);
	});
	onDestroy(() => {
		stopLive?.();
	});

	// --- Fix DNF modal
	let fixDnfOpen = $state(false);

	type DnfEntry = { driver_name: string; driver_tag: string; stage_name: string; stage_id: number };

	const dnfEntries = $derived<DnfEntry[]>(
		bundle.finish_events
			.filter((fe) => fe.dnf)
			.flatMap((fe) => {
				const driver = bundle.drivers.find((d) => String(d.rfid_tag) === String(fe.tag));
				const stage = bundle.stages.find((s) => s.id === fe.stage_id);
				if (!driver || !stage) return [];
				return [{ driver_name: driver.name, driver_tag: fe.tag, stage_name: stage.name, stage_id: fe.stage_id }];
			})
	);

	type FixState = { status: 'idle' | 'fixing' | 'done' | 'error'; message?: string };
	let fixStates = $state<Record<string, FixState>>({});

	function dnfKey(e: DnfEntry) {
		return `${e.driver_tag}:${e.stage_id}`;
	}

	async function fixDnf(entry: DnfEntry) {
		const key = dnfKey(entry);
		fixStates = { ...fixStates, [key]: { status: 'fixing' } };
		const res = await kcFetch('/api/fix-dnf', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ driver_tag: entry.driver_tag, stage_id: entry.stage_id })
		});
		if (res.ok) {
			const data = await res.json();
			fixStates = { ...fixStates, [key]: { status: 'done', message: formatMs(data.estimated_ms) } };
			await loadAll();
		} else {
			const text = await res.text();
			fixStates = { ...fixStates, [key]: { status: 'error', message: text } };
		}
	}
</script>

<div class="w-full space-y-8 p-5">
	{#if auth.isAdmin}
		<div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3">
			<span class="text-sm text-gray-500 dark:text-gray-400">{t.viewPickerLabel}:</span>
			<div class="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
				{#each [null, 'rally', 'rallycross', 'training'] as const as v (v ?? 'auto')}
					{@const isActive = pinnedView === v}
					{@const label =
						v === null
							? pinnedView === null
								? t.viewAutoHint(viewLabel[autoView]())
								: t.viewAuto
							: viewLabel[v]()}
					<button
						type="button"
						disabled={savingView}
						onclick={() => setPinnedView(v)}
						class="px-3 py-1.5 text-sm font-medium transition-colors
							{isActive
							? 'bg-primary-600 text-white dark:bg-primary-500'
							: 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}
							{savingView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
							border-r border-gray-200 last:border-r-0 dark:border-gray-700"
					>
						{label}
					</button>
				{/each}
			</div>
			{#if activeView === 'rally' && dnfEntries.length > 0}
				<Button size="sm" color="yellow" onclick={() => (fixDnfOpen = true)}>
					{t.fixDnfButton} ({dnfEntries.length})
				</Button>
			{/if}
		</div>
	{/if}

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

<!-- Fix DNF Modal -->
<Modal title={t.fixDnfModal} bind:open={fixDnfOpen} size="sm" autoclose={false}>
	{#if dnfEntries.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">{t.fixDnfNoDnfs}</p>
	{:else}
		<div class="space-y-3">
			{#each dnfEntries as entry (dnfKey(entry))}
				{@const state = fixStates[dnfKey(entry)] ?? { status: 'idle' }}
				<div class="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
					<div>
						<span class="font-medium text-gray-900 dark:text-white">{entry.driver_name}</span>
						<span class="ml-2 text-sm text-gray-500 dark:text-gray-400">{entry.stage_name}</span>
						{#if state.status === 'done'}
							<span class="ml-2 text-sm text-green-600 dark:text-green-400">✓ {state.message}</span>
						{:else if state.status === 'error'}
							<span class="ml-2 text-sm text-red-500">{t.fixDnfFailed}{state.message}</span>
						{/if}
					</div>
					<Button
						size="xs"
						color={state.status === 'done' ? 'green' : 'primary'}
						disabled={state.status === 'fixing' || state.status === 'done'}
						onclick={() => fixDnf(entry)}
					>
						{state.status === 'fixing' ? t.fixDnfFixing : state.status === 'done' ? '✓' : t.fixDnfApply}
					</Button>
				</div>
			{/each}
		</div>
	{/if}
	{#snippet footer()}
		<Button color="alternative" onclick={() => (fixDnfOpen = false)}>{t.cancel}</Button>
	{/snippet}
</Modal>
