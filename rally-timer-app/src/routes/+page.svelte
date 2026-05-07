<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../lib/kcFetch';
	import type { BundleResponse } from '../lib/types';
	import RallyResults from '../lib/RallyResults.svelte';
	import RallycrossResults from '../lib/RallycrossResults.svelte';
	import { type DisplayRallyRow, type StageData } from '../lib/results';
	import { buildStageData, buildRallyRows } from '../lib/domain/summary';
	import {
		buildRallycrossLeaderboard,
		type RallycrossDriverResult
	} from '../lib/domain/rallycross';

	type RallycrossDriver = {
		id: number;
		name: string;
		tag: string;
		class_id: number;
		class_name: string;
		passes: number[];
	};
	type RallycrossState = {
		gate_id: string | null;
		gate_name: string | null;
		cooldown_ms: number;
		started_at: number | null;
		drivers: RallycrossDriver[];
	};

	let rallyRows = $state<DisplayRallyRow[]>([]);
	let stageData = $state<StageData[]>([]);
	let rallycross = $state<RallycrossState | null>(null);
	let rallycrossResults = $state<RallycrossDriverResult[]>([]);

	let bundle: BundleResponse = { drivers: [], stages: [], start_events: [], finish_events: [] };

	async function loadAll() {
		const [bundleRes, rxRes] = await Promise.all([
			kcFetch('/api/bundle'),
			fetch('/api/rallycross')
		]);
		if (bundleRes.ok) bundle = await bundleRes.json();
		if (rxRes.ok) rallycross = await rxRes.json();
	}

	function recomputeAll() {
		stageData = buildStageData(
			bundle.drivers,
			bundle.stages,
			bundle.start_events,
			bundle.finish_events
		);
		rallyRows = buildRallyRows(stageData);

		if (rallycross?.started_at) {
			rallycrossResults = buildRallycrossLeaderboard(
				rallycross.drivers.map((d) => ({
					driver_id: d.id,
					driver_name: d.name,
					class_id: d.class_id,
					class_name: d.class_name,
					tag: d.tag,
					passes: d.passes
				})),
				rallycross.started_at,
				rallycross.cooldown_ms
			);
		} else {
			rallycrossResults = [];
		}
	}

	let poller: number | null = null;

	onMount(async () => {
		await loadAll();
		recomputeAll();
		poller = window.setInterval(async () => {
			await loadAll();
			recomputeAll();
		}, 1000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});
</script>

<div class="w-full space-y-8 p-5">
	{#if rallycross?.started_at}
		<RallycrossResults
			results={rallycrossResults}
			startedAt={rallycross.started_at}
			cooldownMs={rallycross.cooldown_ms}
		/>
	{:else}
		<RallyResults {rallyRows} stages={stageData} />
	{/if}
</div>
