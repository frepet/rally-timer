<script lang="ts">
	import { Badge, Card } from 'flowbite-svelte';
	import { formatMs } from '$lib/results';
	import { t } from '$lib/stores/locale.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function fmtClock(ms: number): string {
		return new Date(ms).toLocaleTimeString('sv-SE', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 2
		});
	}
</script>

<div class="mx-auto w-full max-w-4xl space-y-6 p-5">
	<div class="flex items-center gap-4">
		<a href="/rallycross" class="text-sm text-blue-600 hover:underline dark:text-blue-400">
			{t.rxEventsBack}
		</a>
		<p class="text-2xl font-bold">{t.rxEventsPageTitle(data.heat.number)}</p>
	</div>

	<Card class="max-w-none p-4">
		<div class="flex flex-wrap gap-6 text-sm text-gray-600 dark:text-gray-400">
			<span>{t.rxRequiredLaps(data.heat.required_laps)}</span>
			<span>{t.rxCooldownLabel}: {data.cooldown_ms / 1000} s</span>
			{#if data.heat.started_at}
				<span>Start: {fmtClock(data.heat.started_at)}</span>
			{/if}
			{#if data.heat.closed_at}
				<span>→ {fmtClock(data.heat.closed_at)}</span>
			{/if}
		</div>
	</Card>

	{#if !data.gate_configured}
		<p class="text-sm text-gray-500">{t.rxNoGateConfigured}</p>
	{:else if data.heat.started_at === null}
		<p class="text-sm text-gray-500">{t.rxHeatNeverStarted}</p>
	{:else}
		{#each data.drivers as driver (driver.driver_id)}
			<Card class="max-w-none p-4">
				<div class="mb-3 flex items-baseline gap-3">
					<p class="font-semibold">{driver.driver_name}</p>
					<span class="text-xs text-gray-500">{driver.class_name}</span>
					<span class="font-mono text-xs text-gray-400">{driver.tag}</span>
				</div>

				{#if driver.passes.length === 0}
					<p class="text-sm text-gray-500">{t.rxNoEvents}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr
									class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700"
								>
									<th class="pr-4 pb-1">#</th>
									<th class="pr-4 pb-1">{t.rxPassTime}</th>
									<th class="pr-4 pb-1 text-right">{t.rxPassFromStart}</th>
									<th class="pr-4 pb-1 text-right">{t.rxPassDelta}</th>
									<th class="pb-1">{t.rxPassCounted}</th>
								</tr>
							</thead>
							<tbody>
								{#each driver.passes as pass, i (pass.timestamp)}
									{@const fromStart = pass.timestamp - data.heat.started_at!}
									{@const prevTs = i > 0 ? driver.passes[i - 1].timestamp : null}
									{@const delta = prevTs !== null ? pass.timestamp - prevTs : null}
									<tr
										class="border-b border-gray-100 dark:border-gray-800 {pass.counted
											? 'text-gray-900 dark:text-white'
											: 'text-gray-400 dark:text-gray-500'}"
									>
										<td class="py-1.5 pr-4 font-mono">{i + 1}</td>
										<td class="py-1.5 pr-4 font-mono">{fmtClock(pass.timestamp)}</td>
										<td class="py-1.5 pr-4 text-right font-mono">{formatMs(fromStart)}</td>
										<td class="py-1.5 pr-4 text-right font-mono">{formatMs(delta)}</td>
										<td class="py-1.5">
											{#if pass.counted}
												<Badge color="green">{t.rxPassCounted}</Badge>
											{:else}
												<Badge color="red">{t.rxPassFiltered}</Badge>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
		{/each}
	{/if}
</div>
