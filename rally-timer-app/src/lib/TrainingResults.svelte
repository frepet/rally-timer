<script lang="ts">
	import { classChipClass } from './classColor';
	import { formatMs } from './results';
	import { t } from './stores/locale.svelte';
	import { auth } from './stores/auth.svelte';
	import type { TrainingDriverResult } from './domain/training';
	import TrainingLapList from './TrainingLapList.svelte';

	type Props = {
		drivers: TrainingDriverResult[];
		onDeleteLap?: (gateEventId: number) => void;
	};

	let { drivers, onDeleteLap }: Props = $props();

	const canDelete = $derived(!!onDeleteLap && auth.isAdmin);
</script>

{#if drivers.length}
	<div class="overflow-x-auto">
		<table class="data-table">
			<thead>
				<tr>
					<th class="w-12">#</th>
					<th>{t.driverHeader}</th>
					<th class="text-right">{t.trainingLapsColumn}</th>
					<th class="text-right">{t.trainingBestLap}</th>
					<th class="text-right">{t.trainingMedianLap}</th>
					<th class="text-right">{t.trainingLastLap}</th>
				</tr>
			</thead>
			<tbody>
				{#each drivers as d, i (d.driver_id)}
					<tr>
						<td>
							{#if d.lap_count > 0}
								<span class="pos h-7 w-7 text-base {i < 3 ? `pos--${i + 1}` : ''}">{i + 1}</span>
							{:else}—{/if}
						</td>
						<td>
							<span class="font-semibold">{d.driver_name}</span>
							{#if d.class_name}
								<span class="chip ml-1 {classChipClass(d.class_name)}">{d.class_name}</span>
							{/if}
						</td>
						<td class="text-right">{d.lap_count}</td>
						<td class="time text-right text-base">{formatMs(d.best_lap_ms)}</td>
						<td class="text-right">{formatMs(d.median_lap_ms)}</td>
						<td class="text-right">{formatMs(d.last_lap_ms)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		{#each drivers as d (d.driver_id)}
			{#if d.laps.length}
				<div class="rounded-lg ring-1 ring-surface-200 dark:ring-white/8">
					<div
						class="flex items-baseline justify-between gap-2 border-b border-surface-100 px-3 py-2 dark:border-white/8"
					>
						<div class="flex min-w-0 items-center gap-2">
							<p class="truncate font-semibold">{d.driver_name}</p>
							{#if d.class_name}
								<span class="chip {classChipClass(d.class_name)}">{d.class_name}</span>
							{/if}
						</div>
						<p class="stat">
							{d.lap_count} · <span class="stat-label">{t.trainingBestLap}</span><span
								class="time text-sm">{formatMs(d.best_lap_ms)}</span
							>
						</p>
					</div>
					<TrainingLapList
						laps={d.laps}
						bestLapMs={d.best_lap_ms}
						{canDelete}
						ondelete={onDeleteLap}
					/>
				</div>
			{/if}
		{/each}
	</div>
{:else}
	<p class="empty dark:text-surface-400">{t.trainingNoLapsYet}</p>
{/if}
