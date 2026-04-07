<script lang="ts">
	import {
		Card,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Button,
		Heading,
		AccordionItem,
		Accordion,
		P
	} from 'flowbite-svelte';

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
</script>

<!-- Rally leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8">
	<Heading class="mb-4 text-2xl font-bold">Rally Leaderboard</Heading>
	<Table hoverable>
		<TableHead>
			<TableHeadCell>#</TableHeadCell>
			<TableHeadCell>Driver</TableHeadCell>
			<TableHeadCell>Class</TableHeadCell>
			<TableHeadCell>Total</TableHeadCell>
			<TableHeadCell>Δ P1</TableHeadCell>
			<TableHeadCell>Δ Prev</TableHeadCell>
			<TableHeadCell title="How many stages finished">✓ Stg</TableHeadCell>
		</TableHead>
		<TableBody>
			{#each rallyRows as r (r.driver_name)}
				<TableBodyRow>
					<TableBodyCell class="font-semibold">{r.position}</TableBodyCell>
					<TableBodyCell>{r.driver_name}</TableBodyCell>
					<TableBodyCell class="opacity-80">{r.class_name}</TableBodyCell>
					<TableBodyCell class="font-mono">{formatMs(r.total_ms)}</TableBodyCell>
					<TableBodyCell class="font-mono"
						>{r.delta_p1 != null ? '+' + formatMs(r.delta_p1) : '—'}</TableBodyCell
					>
					<TableBodyCell class="font-mono"
						>{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}</TableBodyCell
					>
					<TableBodyCell class="text-center">{r.finished_stages}</TableBodyCell>
				</TableBodyRow>
			{/each}
			{#if !rallyRows.length}
				<TableBodyRow><TableBodyCell colspan={7}>No results yet.</TableBodyCell></TableBodyRow>
			{/if}
		</TableBody>
	</Table>
</Card>

<!-- Stage tabs + leaderboard -->
<Card class="max-w-none p-4 sm:p-6 md:p-8">
	<div class="mb-4 flex flex-wrap gap-2">
		{#each stages as s (s.name)}
			<Button
				size="sm"
				color={activeStage === s.name ? 'blue' : 'light'}
				onclick={() => (activeStage = s.name)}
			>
				{s.name}
			</Button>
		{/each}
		{#if !stages.length}
			<span class="text-sm opacity-70">No stages yet.</span>
		{/if}
	</div>

	{#if activeStage}
		{#if activeRows.length}
			<Accordion flush>
				{#each activeRows as r (r.driver_name)}
					<AccordionItem>
						{#snippet header()}
							<P class="flex w-full items-center gap-3 font-mono text-sm">
								<span class="w-6 text-right font-semibold"><P>{r.position}</P></span>
								<span class="flex-1 font-sans font-medium">
									{r.driver_name}<span class="ml-1 text-xs font-normal opacity-60"
										>({r.class_name})</span
									>
								</span>
								<span class="text-right">
									{#if r.position === 1}
										{formatMs(r.stage_ms)}
									{:else}
										{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
									{/if}
								</span>
							</P>
						{/snippet}
						<P class="flex gap-6 px-2 py-1 font-mono text-sm">
							<span>
								<span class="mr-1 opacity-50"><P>Time</P></span>{formatMs(r.stage_ms)}
							</span>
							<span>
								<span class="mr-1 opacity-50"><P>Δ P1</P></span>{r.delta_p1 != null
									? '+' + formatMs(r.delta_p1)
									: '—'}
							</span>
							<span>
								<span class="mr-1 opacity-50"><P>Δ Prev</P></span>{r.delta_prev != null
									? '+' + formatMs(r.delta_prev)
									: '—'}
							</span>
						</P>
					</AccordionItem>
				{/each}
			</Accordion>
		{:else}
			<p class="text-sm opacity-70">No stage results yet.</p>
		{/if}
	{/if}
</Card>
