<script lang="ts">
	import { Card, Badge } from 'flowbite-svelte';
	import { TrashBinOutline } from 'flowbite-svelte-icons';
	import { formatMs } from './results';
	import { t } from './stores/locale.svelte';
	import { isAdmin } from './stores/auth';
	import type { TrainingDriverResult } from './domain/training';

	type Props = {
		drivers: TrainingDriverResult[];
		onDeleteLap?: (gateEventId: number) => void;
	};

	let { drivers, onDeleteLap }: Props = $props();

	const canDelete = $derived(!!onDeleteLap && $isAdmin);
</script>

{#if drivers.length}
	<Card class="max-w-none p-4">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
						<th class="pr-4 pb-1">#</th>
						<th class="pr-4 pb-1">{t.driverHeader}</th>
						<th class="pr-4 pb-1 text-right">{t.trainingLapsColumn}</th>
						<th class="pr-4 pb-1 text-right">{t.trainingBestLap}</th>
						<th class="pr-4 pb-1 text-right">{t.trainingMedianLap}</th>
						<th class="pb-1 text-right">{t.trainingLastLap}</th>
					</tr>
				</thead>
				<tbody>
					{#each drivers as d, i (d.driver_id)}
						<tr class="border-b border-gray-100 text-gray-900 dark:border-gray-800 dark:text-white">
							<td class="py-1.5 pr-4 font-mono">{d.lap_count > 0 ? i + 1 : '—'}</td>
							<td class="py-1.5 pr-4">
								<span class="font-medium">{d.driver_name}</span>
								{#if d.class_name}
									<span class="ml-1 text-xs opacity-60">{d.class_name}</span>
								{/if}
							</td>
							<td class="py-1.5 pr-4 text-right font-mono">{d.lap_count}</td>
							<td class="py-1.5 pr-4 text-right font-mono">{formatMs(d.best_lap_ms)}</td>
							<td class="py-1.5 pr-4 text-right font-mono">{formatMs(d.median_lap_ms)}</td>
							<td class="py-1.5 text-right font-mono">{formatMs(d.last_lap_ms)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card>

	{#each drivers as d (d.driver_id)}
		{#if d.laps.length}
			<Card class="max-w-none p-4">
				<div class="mb-3 flex items-baseline justify-between gap-2">
					<div>
						<p class="font-semibold">{d.driver_name}</p>
						{#if d.class_name}
							<p class="text-xs text-gray-500">{d.class_name}</p>
						{/if}
					</div>
					<p class="text-sm text-gray-500">
						{d.lap_count} · {t.trainingBestLap}
						<span class="font-mono">{formatMs(d.best_lap_ms)}</span>
					</p>
				</div>
				<ul class="space-y-1">
					{#each d.laps as lap, idx (lap.gate_event_id)}
						{@const isBest = lap.lap_ms === d.best_lap_ms}
						<li
							class="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm odd:bg-gray-50 dark:odd:bg-gray-700/30"
						>
							<div class="flex items-center gap-3">
								<span class="w-12 font-mono text-xs text-gray-500"
									>{t.trainingLapNumber(idx + 1)}</span
								>
								<span class="font-mono {isBest ? 'font-semibold' : ''}">{formatMs(lap.lap_ms)}</span
								>
								{#if isBest}
									<Badge color="green" class="text-xs">{t.trainingBestLap}</Badge>
								{/if}
							</div>
							{#if canDelete}
								<button
									type="button"
									class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700 dark:hover:text-red-400"
									onclick={() => onDeleteLap!(lap.gate_event_id)}
									aria-label={t.delete}
								>
									<TrashBinOutline size="xs" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</Card>
		{/if}
	{/each}
{:else}
	<p class="text-sm text-gray-500 dark:text-gray-400">{t.trainingNoLapsYet}</p>
{/if}
