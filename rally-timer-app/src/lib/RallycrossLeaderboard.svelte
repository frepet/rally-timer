<script lang="ts">
	import { classChipClass } from './classColor';
	import { formatMs } from './results';
	import type {
		RxStandingDisplay,
		RxHeatDisplay,
		RxHeatEntryDisplay
	} from './domain/rallycrossDisplay';
	import { t } from './stores/locale.svelte';

	let {
		standings,
		heats,
		live = null,
		showRatings = false
	}: {
		standings: RxStandingDisplay[];
		heats: RxHeatDisplay[];
		live?: { number: number; required_laps: number; entries: RxHeatEntryDisplay[] } | null;
		showRatings?: boolean;
	} = $props();

	function fmtRating(delta: number | null): string {
		if (delta === null) return '';
		return delta > 0 ? `+${delta}` : `${delta}`;
	}

	function ratingClass(delta: number | null): string {
		if (!delta) return 'text-surface-500 dark:text-surface-400';
		return delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
	}

	function fmtDelta(ms: number | null): string {
		return ms ? `+${formatMs(ms)}` : '0';
	}

	function hasTimes(heat: { entries: RxHeatEntryDisplay[] }): boolean {
		return heat.entries.some((e) => e.total_ms !== null);
	}

	function hasDelta(heat: { entries: RxHeatEntryDisplay[] }): boolean {
		return heat.entries.some((e) => e.delta_ms !== null);
	}
</script>

<div class="space-y-6">
	{#if live}
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<h3 class="panel-title text-lg">{t.rxHeatLabel(live.number)}</h3>
				<span class="chip chip--ok">
					<span class="status-dot status-dot--live"></span>
					{t.rxStatusInProgress}
				</span>
			</div>
			<div class="overflow-x-auto p-2 sm:p-3">
				{#if live.entries.length}
					<table class="data-table">
						<thead>
							<tr>
								<th class="w-10">#</th>
								<th>{t.driverHeader}</th>
								<th class="text-right">{t.rxLapsColumn}</th>
								<th class="text-right">{t.rxBestLap}</th>
								<th class="text-right">{t.rxDeltaColumn}</th>
								<th class="text-right">{t.totalLabel}</th>
							</tr>
						</thead>
						<tbody>
							{#each live.entries as e (e.driver_name)}
								<tr class={e.dnf ? 'opacity-60' : ''}>
									<td class="time text-base">{e.position}</td>
									<td>
										<span class="font-semibold">{e.driver_name}</span>
										<span class="chip ml-1 {classChipClass(e.class_name)}">{e.class_name}</span>
										{#if e.dnf}<span class="chip chip--danger ml-1">DNF</span>{/if}
									</td>
									<td class="time text-right text-base">{e.lap_count ?? 0}/{live.required_laps}</td>
									<td class="text-right text-surface-500 dark:text-surface-400"
										>{formatMs(e.best_lap_ms)}</td
									>
									<td class="text-right text-surface-500 dark:text-surface-400"
										>{fmtDelta(e.delta_ms)}</td
									>
									<td class="time text-right text-base">{formatMs(e.total_ms)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="empty dark:text-surface-400">{t.rxWaitingForDrivers}</p>
				{/if}
			</div>
		</section>
	{/if}

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
							{#if showRatings}<th class="text-right">{t.rxRatingColumn}</th>{/if}
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
								{#if showRatings}
									<td class="time text-right">
										{#if r.rating !== null}
											{r.rating}
											<span class="ml-1 text-sm {ratingClass(r.rating_delta)}"
												>({fmtRating(r.rating_delta)})</span
											>
										{/if}
									</td>
								{/if}
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
									{#if hasDelta(heat)}<th class="text-right">{t.rxDeltaColumn}</th>{/if}
									<th class="text-right">{t.totalLabel}</th>
								{/if}
								{#if showRatings}<th class="text-right">{t.ratingDeltaLabel}</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each heat.entries as e (e.driver_name)}
								<tr class={e.dnf ? 'opacity-60' : ''}>
									<td class="time text-base">{e.dnf && e.lap_count === null ? '—' : e.position}</td>
									<td>
										<span class="font-semibold">{e.driver_name}</span>
										<span class="chip ml-1 {classChipClass(e.class_name)}">{e.class_name}</span>
										{#if e.dnf}<span class="chip chip--danger ml-1">DNF</span>{/if}
									</td>
									{#if hasTimes(heat)}
										<td class="text-right text-surface-500 dark:text-surface-400"
											>{formatMs(e.best_lap_ms)}</td
										>
										{#if hasDelta(heat)}
											<td class="text-right text-surface-500 dark:text-surface-400"
												>{fmtDelta(e.delta_ms)}</td
											>
										{/if}
										<td class="time text-right text-base">{formatMs(e.total_ms)}</td>
									{/if}
									{#if showRatings}
										<td class="time text-right text-base {ratingClass(e.rating_delta)}"
											>{fmtRating(e.rating_delta)}</td
										>
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
