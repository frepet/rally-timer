<script lang="ts">
	import { Badge, Card } from 'flowbite-svelte';
	import { formatMs } from './results';
	import type { RxStandingDisplay, RxHeatDisplay } from './domain/rallycrossDisplay';
	import { t } from './stores/locale.svelte';

	let {
		standings,
		heats
	}: {
		standings: RxStandingDisplay[];
		heats: RxHeatDisplay[];
	} = $props();

	function hasTimes(heat: RxHeatDisplay): boolean {
		return heat.entries.some((e) => e.total_ms !== null);
	}
</script>

<div class="space-y-4">
	{#each heats as heat (heat.number)}
		<Card class="max-w-none p-4">
			<div class="mb-2 flex items-center gap-2">
				<span class="font-semibold">{t.rxHeatLabel(heat.number)}</span>
				<Badge color="gray">{t.rxStatusDone}</Badge>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
							<th class="pb-1 pr-4">#</th>
							<th class="pb-1 pr-4">{t.driverHeader}</th>
							{#if hasTimes(heat)}
								<th class="pb-1 pr-4 text-right">{t.rxBestLap}</th>
								<th class="pb-1 text-right">{t.totalLabel}</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each heat.entries as e (e.driver_name)}
							<tr
								class="border-b border-gray-100 dark:border-gray-800 {e.dnf
									? 'text-gray-400 dark:text-gray-500'
									: 'text-gray-900 dark:text-white'}"
							>
								<td class="py-1.5 pr-4 font-mono">{e.dnf ? '—' : e.position}</td>
								<td class="py-1.5 pr-4">
									<span class="font-medium">{e.driver_name}</span>
									<span class="ml-1 text-xs opacity-60">{e.class_name}</span>
									{#if e.dnf}<Badge color="red" class="ml-1 text-xs">DNF</Badge>{/if}
								</td>
								{#if hasTimes(heat)}
									<td class="py-1.5 pr-4 text-right font-mono text-xs text-gray-500"
										>{formatMs(e.best_lap_ms)}</td
									>
									<td class="py-1.5 text-right font-mono">{formatMs(e.total_ms)}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/each}

	{#if standings.length}
		<Card class="max-w-none p-4">
			<p class="mb-3 font-semibold">{t.rxOverallStandings}</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
							<th class="pb-1 pr-4">#</th>
							<th class="pb-1 pr-4">{t.driverHeader}</th>
							<th class="pb-1 pr-4 text-right">{t.rxPoints}</th>
							<th class="pb-1 pr-4 text-right">{t.rxBestLap}</th>
							<th class="pb-1 text-right">{t.rxBestTime}</th>
						</tr>
					</thead>
					<tbody>
						{#each standings as r, i (r.driver_name)}
							<tr
								class="border-b border-gray-100 dark:border-gray-800 {r.best_total_ms !== null
									? 'text-gray-900 dark:text-white'
									: 'text-gray-400 dark:text-gray-500'}"
							>
								<td class="py-1.5 pr-4 font-mono font-semibold">{i + 1}</td>
								<td class="py-1.5 pr-4">
									<span class="font-medium">{r.driver_name}</span>
									<span class="ml-1 text-xs opacity-60">{r.class_name}</span>
								</td>
								<td class="py-1.5 pr-4 text-right font-mono font-semibold">{r.total_points}</td>
								<td class="py-1.5 pr-4 text-right font-mono text-xs text-gray-500"
									>{formatMs(r.best_lap_ms)}</td
								>
								<td class="py-1.5 text-right font-mono text-xs text-gray-500"
									>{formatMs(r.best_total_ms)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</div>
