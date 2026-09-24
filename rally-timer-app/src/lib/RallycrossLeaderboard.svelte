<script lang="ts">
	import { classChipClass } from './classColor';
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

<div class="space-y-6">
	{#if standings.length}
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<h2 class="panel-title">{t.rxOverallStandings}</h2>
			</div>
			<div class="overflow-x-auto p-2 sm:p-3">
				<table class="data-table">
					<thead>
						<tr>
							<th class="w-12">#</th>
							<th>{t.driverHeader}</th>
							<th class="text-right">{t.rxPoints}</th>
							<th class="text-right">{t.rxBestLap}</th>
							<th class="text-right">{t.rxBestTime}</th>
						</tr>
					</thead>
					<tbody>
						{#each standings as r, i (r.driver_name)}
							<tr class={r.best_total_ms !== null ? '' : 'opacity-50'}>
								<td
									><span class="pos h-8 w-8 text-lg {i < 3 ? `pos--${i + 1}` : ''}">{i + 1}</span
									></td
								>
								<td>
									<span class="font-semibold">{r.driver_name}</span>
									<span class="chip ml-1 {classChipClass(r.class_name)}">{r.class_name}</span>
								</td>
								<td class="time text-right text-2xl">{r.total_points}</td>
								<td class="text-right text-surface-500 dark:text-surface-400"
									>{formatMs(r.best_lap_ms)}</td
								>
								<td class="text-right text-surface-500 dark:text-surface-400"
									>{formatMs(r.best_total_ms)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		{#each heats as heat (heat.number)}
			<section class="panel overflow-hidden">
				<div class="panel-head">
					<h3 class="panel-title text-lg">{t.rxHeatLabel(heat.number)}</h3>
					<span class="chip">{t.rxStatusDone}</span>
				</div>
				<div class="overflow-x-auto p-2 sm:p-3">
					<table class="data-table">
						<thead>
							<tr>
								<th class="w-10">#</th>
								<th>{t.driverHeader}</th>
								{#if hasTimes(heat)}
									<th class="text-right">{t.rxBestLap}</th>
									<th class="text-right">{t.totalLabel}</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each heat.entries as e (e.driver_name)}
								<tr class={e.dnf ? 'opacity-60' : ''}>
									<td class="time text-base">{e.dnf ? '—' : e.position}</td>
									<td>
										<span class="font-semibold">{e.driver_name}</span>
										<span class="chip ml-1 {classChipClass(e.class_name)}">{e.class_name}</span>
										{#if e.dnf}<span class="chip chip--danger ml-1">DNF</span>{/if}
									</td>
									{#if hasTimes(heat)}
										<td class="text-right text-surface-500 dark:text-surface-400"
											>{formatMs(e.best_lap_ms)}</td
										>
										<td class="time text-right text-base">{formatMs(e.total_ms)}</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/each}
	</div>
</div>
