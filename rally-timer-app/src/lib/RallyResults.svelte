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
		Heading
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
		<Table hoverable>
			<TableHead>
				<TableHeadCell>#</TableHeadCell>
				<TableHeadCell>Driver</TableHeadCell>
				<TableHeadCell>Class</TableHeadCell>
				<TableHeadCell>Stage Time</TableHeadCell>
				<TableHeadCell>Δ P1</TableHeadCell>
				<TableHeadCell>Δ Prev</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each activeRows as r (r.driver_name)}
					<TableBodyRow>
						<TableBodyCell class="font-semibold">{r.position}</TableBodyCell>
						<TableBodyCell>{r.driver_name}</TableBodyCell>
						<TableBodyCell class="opacity-80">{r.class_name}</TableBodyCell>
						<TableBodyCell class="font-mono">{formatMs(r.stage_ms)}</TableBodyCell>
						<TableBodyCell class="font-mono"
							>{r.delta_p1 != null ? '+' + formatMs(r.delta_p1) : '—'}</TableBodyCell
						>
						<TableBodyCell class="font-mono"
							>{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}</TableBodyCell
						>
					</TableBodyRow>
				{/each}
				{#if !activeRows.length}
					<TableBodyRow
						><TableBodyCell colspan={6}>No stage results yet.</TableBodyCell></TableBodyRow
					>
				{/if}
			</TableBody>
		</Table>
	{/if}
</Card>
