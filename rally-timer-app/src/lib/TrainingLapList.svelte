<script lang="ts">
	import { TrashBinOutline } from 'flowbite-svelte-icons';
	import type { TrainingLap } from './domain/training';
	import { formatMs } from './results';
	import { t } from './stores/locale.svelte';

	let {
		laps,
		bestLapMs,
		canDelete = false,
		ondelete
	}: {
		laps: TrainingLap[];
		bestLapMs: number | null;
		canDelete?: boolean;
		ondelete?: (gateEventId: number) => void;
	} = $props();

	let list = $state<HTMLUListElement | null>(null);
	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let previousLapCount = 0;
	let initialized = false;

	function updateFades() {
		if (!list) return;
		fadeTop = list.scrollTop > 1;
		fadeBottom = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
	}

	$effect(() => {
		const lapCount = laps.length;
		if (!list) return;
		if (!initialized || lapCount > previousLapCount) {
			const behavior: ScrollBehavior = initialized ? 'smooth' : 'auto';
			queueMicrotask(() => {
				list?.scrollTo({ top: list.scrollHeight, behavior });
				updateFades();
			});
		}
		previousLapCount = lapCount;
		initialized = true;
	});

	$effect(() => {
		if (!list) return;
		const observer = new ResizeObserver(updateFades);
		observer.observe(list);
		updateFades();
		return () => observer.disconnect();
	});
</script>

<ul
	bind:this={list}
	class="lap-list divide-y divide-surface-100 dark:divide-white/5"
	class:fade-top={fadeTop}
	class:fade-bottom={fadeBottom}
	onscroll={updateFades}
>
	{#each laps as lap, idx (lap.gate_event_id)}
		{@const isBest = lap.lap_ms === bestLapMs}
		<li
			class="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5 text-sm {isBest
				? 'bg-green-50 dark:bg-green-500/8'
				: ''}"
		>
			<div class="flex items-center gap-3">
				<span class="stat-label w-12">{t.trainingLapNumber(idx + 1)}</span>
				<span class="time text-base {isBest ? 'text-green-700 dark:text-green-400' : ''}"
					>{formatMs(lap.lap_ms)}</span
				>
				{#if isBest}
					<span class="chip chip--ok">{t.trainingBestLap}</span>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				{#if lap.rssi !== null}
					<span class="stat text-surface-400">{t.trainingRssi} {lap.rssi}</span>
				{/if}
				{#if canDelete && ondelete}
					<button
						type="button"
						class="rounded p-1 text-surface-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
						onclick={() => ondelete(lap.gate_event_id)}
						aria-label={t.delete}
					>
						<TrashBinOutline size="xs" />
					</button>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	.lap-list {
		max-height: 12.5rem;
		overflow-y: auto;
		scrollbar-width: none;
		--fade: 1.5rem;
	}
	.lap-list::-webkit-scrollbar {
		display: none;
	}
	.lap-list.fade-top {
		mask-image: linear-gradient(to bottom, transparent, #000 var(--fade));
	}
	.lap-list.fade-bottom {
		mask-image: linear-gradient(to top, transparent, #000 var(--fade));
	}
	.lap-list.fade-top.fade-bottom {
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent
		);
	}
</style>
