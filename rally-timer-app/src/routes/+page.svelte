<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../lib/kcFetch';
	import type { BundleResponse } from '../lib/types';
	import RallyResults from '../lib/RallyResults.svelte';
	import { type DisplayRallyRow, type StageData } from '../lib/results';
	import { buildStageData, buildRallyRows } from '../lib/domain/summary';

	let rallyRows = $state<DisplayRallyRow[]>([]);
	let stageData = $state<StageData[]>([]);

	let bundle: BundleResponse = { drivers: [], stages: [], start_events: [], finish_events: [] };

	async function loadAllRaw() {
		const res = await kcFetch('/api/bundle');
		if (!res.ok) return;
		bundle = await res.json();
	}

	async function recomputeAll() {
		stageData = buildStageData(
			bundle.drivers,
			bundle.stages,
			bundle.start_events,
			bundle.finish_events
		);
		rallyRows = buildRallyRows(stageData);
	}

	let poller: number | null = null;

	onMount(async () => {
		await loadAllRaw();
		await recomputeAll();
		poller = window.setInterval(async () => {
			await loadAllRaw();
			await recomputeAll();
		}, 1000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});
</script>

<div class="w-full space-y-8 p-5">
	<RallyResults {rallyRows} stages={stageData} />
</div>
