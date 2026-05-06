<script lang="ts">
	import { Card, Button, Heading, Badge } from 'flowbite-svelte';

	import { formatMs, type DisplayRallyRow, type StageData } from './results';

	let {
		rallyRows,
		stages
	}: {
		rallyRows: DisplayRallyRow[];
		stages: StageData[];
	} = $props();

	let activeStage = $state(stages[0]?.name ?? null);

	$effect(() => {
		if (activeStage == null && stages.length) activeStage = stages[0].name;
	});

	const activeRows = $derived(stages.find((s) => s.name === activeStage)?.rows ?? []);

	let classAbbreviations: Record<string, string> = {
		'Group A': 'A',
		'Group B': 'B',
		'Group S': 'S'
	};
</script>

<!-- Rally leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8 dark:bg-surface-850">
	<Heading class="mb-4 text-2xl font-bold">Rally Leaderboard</Heading>
	{#if rallyRows.length}
		<div>
			{#each rallyRows as r, i (r.driver_name)}
				<div class="rounded px-2 py-1 {i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/40' : ''}">
					<div class="flex items-center font-mono text-sm">
						<span class=" w-6 text-right text-xl font-semibold text-gray-900 dark:text-white"
							>{r.position}</span
						>
						<span class=" text-l ml-3 flex-1 font-sans font-medium text-gray-900 dark:text-white">
							{r.driver_name}<span class=" text-l ml-1 font-normal opacity-60"
								>({classAbbreviations[r.class_name]})</span
							>
						</span>
						<span class="text-right text-xl text-gray-900 dark:text-white">
							{#if r.position === 1}
								{formatMs(r.total_ms)}
							{:else}
								{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
							{/if}
						</span>
					</div>
					<div
						class="ml-9 flex flex-wrap gap-x-6 gap-y-0.5 font-mono text-xs text-gray-500 dark:text-gray-400"
					>
						{#if r.position !== 1}
							<span class="whitespace-nowrap"
								><span class="mr-1 opacity-50">Total</span>{formatMs(r.total_ms)}</span
							>
							<span class="whitespace-nowrap"
								><span class="mr-1 opacity-50">Δ P1</span>{r.delta_p1 != null
									? '+' + formatMs(r.delta_p1)
									: '—'}</span
							>
						{/if}
						<span class="whitespace-nowrap"
							><span class="mr-1 opacity-50">Stages</span>{r.finished_stages}</span
						>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No results yet.</p>
	{/if}
</Card>

<!-- Stage tabs + leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8 dark:bg-surface-850">
	<div class="mb-4 flex flex-wrap gap-2">
		{#each stages as s (s.name)}
			<Button
				size="sm"
				color={activeStage === s.name ? 'blue' : 'alternative'}
				onclick={() => (activeStage = s.name)}
			>
				{s.name}
			</Button>
		{/each}
		{#if !stages.length}
			<span class="text-sm text-gray-500 dark:text-gray-400">No stages yet.</span>
		{/if}
	</div>

	{#if activeStage}
		{#if activeRows.length}
			<div>
				{#each activeRows as r, i (r.driver_name)}
					<div class="rounded px-2 py-1 {i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/40' : ''}">
						<div class="flex items-center font-mono text-sm">
							{#if r.dnf}
								<Badge color="red" class="w-9 justify-center text-xs">DNF</Badge>
							{:else}
								<span class="w-6 text-right font-semibold text-gray-900 dark:text-white"
									>{r.position}</span
								>
							{/if}
							<span class="ml-3 flex-1 font-sans font-medium text-gray-900 dark:text-white">
								{r.driver_name}<span class="ml-1 text-xs font-normal opacity-60"
									>({classAbbreviations[r.class_name]})</span
								>
							</span>
							<span class="text-right text-gray-900 dark:text-white">
								{#if r.dnf}
									{formatMs(r.stage_ms)}
								{:else if r.position === 1}
									{formatMs(r.stage_ms)}
								{:else}
									{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
								{/if}
							</span>
						</div>
						<div
							class="ml-9 flex flex-wrap gap-x-6 gap-y-0.5 font-mono text-xs text-gray-500 dark:text-gray-400"
						>
							{#if r.position !== 1}
								<span class="whitespace-nowrap"
									><span class="mr-1 opacity-50">Time</span>{formatMs(r.stage_ms)}</span
								>
								{#if !r.dnf}
									<span class="whitespace-nowrap"
										><span class="mr-1 opacity-50">Δ P1</span>{r.delta_p1 != null
											? '+' + formatMs(r.delta_p1)
											: '—'}</span
									>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">No stage results yet.</p>
		{/if}
	{/if}
</Card>
