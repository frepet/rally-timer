<script lang="ts">
	import { Card, Badge } from 'flowbite-svelte';
	import { formatMs } from './results';
	import type { RallycrossDriverResult } from './domain/rallycross';

	let {
		results,
		startedAt,
		cooldownMs
	}: {
		results: RallycrossDriverResult[];
		startedAt: number | null;
		cooldownMs: number;
	} = $props();

	const elapsed = $derived(startedAt ? Date.now() - startedAt : 0);
</script>

<Card class="max-w-none p-4 sm:p-6 md:p-8 dark:bg-surface-850">
	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
		<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
			Rallycross
		</p>
		<div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
			{#if startedAt}
				<Badge color="green">Pågår</Badge>
				<span class="font-mono">Total tid {formatMs(elapsed)}</span>
			{:else}
				<Badge color="gray">Ej startat</Badge>
			{/if}
			<span class="font-mono opacity-70">Cooldown {Math.round(cooldownMs / 1000)}s</span>
		</div>
	</div>

	{#if !startedAt}
		<p class="text-sm text-gray-500 dark:text-gray-400">Väntar på masstart.</p>
	{:else if !results.length}
		<p class="text-sm text-gray-500 dark:text-gray-400">Inga förare än.</p>
	{:else}
		<div>
			{#each results as r, i (r.driver_id)}
				<div
					class="grid grid-cols-[2.25rem_1fr_auto] items-start gap-x-3 rounded px-2 py-1 {i % 2 ===
					0
						? 'bg-gray-50 dark:bg-gray-700/40'
						: ''}"
				>
					<span
						class="row-span-2 self-center text-right text-xl font-semibold text-gray-900 dark:text-white"
					>
						{r.lap_count > 0 ? i + 1 : '—'}
					</span>
					<div class="flex flex-wrap items-baseline gap-x-1.5 font-sans">
						<span class="font-medium text-gray-900 dark:text-white">{r.driver_name}</span>
						<span class="text-sm font-normal opacity-60">{r.class_name}</span>
					</div>
					<span
						class="row-span-2 self-center text-right font-mono text-xl text-gray-900 dark:text-white"
					>
						{formatMs(r.best_lap_ms)}
					</span>
					<div
						class="flex flex-wrap gap-x-6 gap-y-0.5 font-mono text-xs text-gray-500 dark:text-gray-400"
					>
						<span class="whitespace-nowrap"
							><span class="mr-1 opacity-50">Varv</span>{r.lap_count}</span
						>
						<span class="whitespace-nowrap"
							><span class="mr-1 opacity-50">Senaste</span>{formatMs(r.last_lap_ms)}</span
						>
						<span class="whitespace-nowrap"
							><span class="mr-1 opacity-50">Totalt</span>{formatMs(r.total_ms)}</span
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Card>
