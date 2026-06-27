<script lang="ts">
	import { Card, Button, Badge } from 'flowbite-svelte';

	import { untrack } from 'svelte';
	import { formatMs, type DisplayRallyRow, type StageData } from './results';
	import { t } from './stores/locale.svelte';
	import type { RallyRatings } from './domain/ratings';

	let {
		rallyRows,
		stages,
		ratings = null
	}: {
		rallyRows: DisplayRallyRow[];
		stages: StageData[];
		ratings?: RallyRatings | null;
	} = $props();

	function defaultStage(stages: StageData[]): string | null {
		return (
			stages.find((s) => s.status === 'live')?.name ??
			stages.findLast((s) => s.status === 'closed')?.name ??
			stages.find((s) => s.status === 'upcoming')?.name ??
			stages[0]?.name ??
			null
		);
	}

	let activeStage = $state(untrack(() => defaultStage(stages)));

	$effect(() => {
		if (activeStage == null && stages.length) activeStage = defaultStage(stages);
	});

	const activeRows = $derived(stages.find((s) => s.name === activeStage)?.rows ?? []);

	function fmtDelta(delta: number): string {
		return delta >= 0 ? `+${delta}` : `${delta}`;
	}
</script>

<!-- Rally leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8 dark:bg-surface-850">
	<p class="small-caps mb-4 text-xl font-semibold tracking-widest text-black dark:text-white">
		{t.rallyLeaderboard}
	</p>
	{#if rallyRows.length}
		<div>
			{#each rallyRows as r, i (r.driver_uuid)}
				<div
					class="grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-3 rounded px-2 py-1 {i % 2 === 0
						? 'bg-gray-50 dark:bg-gray-700/40'
						: ''}"
				>
					<!-- Position — spans both rows -->
					<span
						class="row-span-2 self-center text-right text-xl font-semibold text-gray-900 dark:text-white"
						>{r.position}</span
					>
					<!-- Driver name -->
					<div class="flex flex-wrap items-baseline gap-x-1.5 font-sans">
						<span class="font-medium text-gray-900 dark:text-white">{r.driver_name}</span>
						<span class="text-sm font-normal opacity-60">{r.class_name}</span>
					</div>
					<!-- Result — spans both rows -->
					<span
						class="row-span-2 self-center text-right font-mono text-xl text-gray-900 dark:text-white"
					>
						{#if r.position === 1}
							{formatMs(r.total_ms)}
						{:else}
							{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
						{/if}
					</span>
					<!-- Stats row -->
					<div
						class="flex flex-wrap gap-x-6 gap-y-0.5 font-mono text-xs text-gray-500 dark:text-gray-400"
					>
						{#if r.position !== 1}
							<span class="whitespace-nowrap"
								><span class="mr-1 opacity-50">{t.totalLabel}</span>{formatMs(r.total_ms)}</span
							>
							<span class="whitespace-nowrap"
								><span class="mr-1 opacity-50">Δ P1</span>{r.delta_p1 != null
									? '+' + formatMs(r.delta_p1)
									: '—'}</span
							>
						{/if}
						<span class="whitespace-nowrap"
							><span class="mr-1 opacity-50">{t.stagesStatLabel}</span>{r.finished_stages}</span
						>
						{#if r.penalty_ms > 0}
							<span class="whitespace-nowrap text-amber-600 dark:text-amber-400"
								><span class="mr-1 opacity-70">{t.penaltyLabel}</span>+{formatMs(
									r.penalty_ms
								)}</span
							>
						{/if}
						{#if ratings}
							{@const finalRating = ratings.finalRatings.get(r.driver_uuid)}
							{#if finalRating != null}
								<span class="whitespace-nowrap text-violet-600 dark:text-violet-400"
									><span class="mr-1 opacity-70">{t.ratingLabel}</span>{finalRating}</span
								>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">{t.noResultsYet}</p>
	{/if}
</Card>

<!-- Stage tabs + leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8 dark:bg-surface-850">
	<p class="small-caps mb-4 text-xl font-semibold tracking-widest text-black dark:text-white">
		{t.stageLeaderboard}
	</p>
	<div class="mb-4 flex flex-wrap gap-2">
		{#each stages as s (s.name)}
			<Button
				size="sm"
				color={activeStage === s.name ? 'primary' : 'alternative'}
				onclick={() => (activeStage = s.name)}
				class="flex items-center gap-2"
			>
				{s.name}
				{#if s.status === 'live'}
					<span class="status-dot status-dot--live"></span>
				{:else if s.status === 'upcoming'}
					<span class="status-dot status-dot--upcoming"></span>
				{:else if s.status === 'closed'}
					<span class="status-dot status-dot--off"></span>
				{/if}
			</Button>
		{/each}
		{#if !stages.length}
			<span class="text-sm text-gray-500 dark:text-gray-400">{t.noStagesYet}</span>
		{/if}
	</div>

	{#if activeStage}
		{#if activeRows.length}
			<div>
				{#each activeRows as r, i (r.driver_uuid)}
					<div
						class="grid grid-cols-[2.25rem_1fr_auto] items-start gap-x-3 rounded px-2 py-1 {i %
							2 ===
						0
							? 'bg-gray-50 dark:bg-gray-700/40'
							: ''}"
					>
						<!-- Position or DNF badge — spans both rows -->
						<div class="row-span-2 self-center">
							{#if r.dnf}
								<Badge color="red" class="justify-center text-xs">DNF</Badge>
							{:else}
								<span class="block text-right text-xl font-semibold text-gray-900 dark:text-white"
									>{r.position}</span
								>
							{/if}
						</div>
						<!-- Driver name -->
						<div class="flex flex-wrap items-baseline gap-x-1.5 font-sans">
							<span class="font-medium text-gray-900 dark:text-white">{r.driver_name}</span>
							<span class="text-sm font-normal opacity-60">{r.class_name}</span>
						</div>
						<!-- Result — spans both rows -->
						<span
							class="row-span-2 self-center text-right font-mono text-xl text-gray-900 dark:text-white"
						>
							{#if r.dnf || r.position === 1}
								{formatMs(r.stage_ms)}
							{:else}
								{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
							{/if}
						</span>
						<!-- Stats row -->
						<div
							class="flex flex-wrap gap-x-6 gap-y-0.5 font-mono text-xs text-gray-500 dark:text-gray-400"
						>
							{#if r.position !== 1}
								<span class="whitespace-nowrap"
									><span class="mr-1 opacity-50">{t.timeLabel}</span>{formatMs(r.stage_ms)}</span
								>
								{#if !r.dnf}
									<span class="whitespace-nowrap"
										><span class="mr-1 opacity-50">Δ P1</span>{r.delta_p1 != null
											? '+' + formatMs(r.delta_p1)
											: '—'}</span
									>
								{/if}
							{/if}
							{#if r.penalty_ms > 0}
								<span class="whitespace-nowrap text-amber-600 dark:text-amber-400"
									><span class="mr-1 opacity-70">{t.penaltyLabel}</span>+{formatMs(
										r.penalty_ms
									)}</span
								>
							{/if}
							{#if ratings && activeStage}
								{@const delta = ratings.stageDeltas.get(activeStage)?.get(r.driver_uuid)}
								{#if delta != null}
									<span
										class="whitespace-nowrap {delta >= 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-500 dark:text-red-400'}"
										><span class="mr-1 opacity-70">{t.ratingDeltaLabel}</span>{fmtDelta(
											delta
										)}</span
									>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">{t.noStageResultsYet}</p>
		{/if}
	{/if}
</Card>
