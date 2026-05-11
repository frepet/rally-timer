<script lang="ts">
	import { Card, Button, Badge, Modal, Checkbox } from 'flowbite-svelte';
	import { ArrowLeftOutline, PlayOutline, StopOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../../lib/kcFetch';
	import { isAdmin } from '../../../lib/stores/auth';
	import { formatMs } from '../../../lib/results';
	import { t } from '../../../lib/stores/locale.svelte';
	import type { HeatResult } from '../../../lib/domain/rallycross';

	type ActiveHeat = {
		id: number;
		number: number;
		required_laps: number;
		started_at: number;
		closed_at: null;
	};

	type RallycrossConfig = {
		gate_id: string | null;
		max_per_heat: number;
		required_laps: number;
		active_heat: ActiveHeat | null;
		heats: { id: number; number: number; started_at: number | null; closed_at: number | null }[];
	};

	type DriverStanding = {
		driver_id: number;
		driver_name: string;
		class_id: number;
		class_name: string;
		best_total_ms: number | null;
	};

	type OverallResult = {
		driver_id: number;
		driver_name: string;
		class_id: number;
		class_name: string;
		best_total_ms: number | null;
		best_heat_number: number | null;
		heat_results: HeatResult[];
	};

	let rx = $state<RallycrossConfig>({
		gate_id: null,
		max_per_heat: 4,
		required_laps: 3,
		active_heat: null,
		heats: []
	});

	let standings = $state<DriverStanding[]>([]);
	let suggestedGroups = $state<number[][]>([]);
	let leaderboard = $state<OverallResult[]>([]);

	let selectedDriverIds = $state(new Set<number>());
	let closeModalOpen = $state(false);
	let creating = $state(false);
	let starting = $state(false);
	let closing = $state(false);

	const activeHeatResults = $derived<HeatResult[]>(
		rx.active_heat
			? leaderboard
					.flatMap((d) => d.heat_results)
					.filter((r) => r.heat_number === rx.active_heat!.number)
					.sort((a, b) => {
						if (a.finished !== b.finished) return a.finished ? -1 : 1;
						if (a.finished && b.finished) return (a.total_ms ?? 0) - (b.total_ms ?? 0);
						return b.lap_count - a.lap_count;
					})
			: []
	);

	const tooManySelected = $derived(selectedDriverIds.size > rx.max_per_heat);

	function selectGroup(group: number[]) {
		selectedDriverIds = new Set(group);
	}

	function toggleDriver(id: number) {
		const next = new Set(selectedDriverIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedDriverIds = next;
	}

	async function loadAll() {
		const [cfgRes, suggestRes, boardRes] = await Promise.all([
			fetch('/api/rallycross'),
			fetch('/api/rallycross/suggest-heat'),
			fetch('/api/rallycross/leaderboard')
		]);
		if (cfgRes.ok) rx = await cfgRes.json();
		if (suggestRes.ok) {
			const data = await suggestRes.json();
			suggestedGroups = data.groups ?? [];
			standings = data.standings ?? [];
		}
		if (boardRes.ok) leaderboard = await boardRes.json();
	}

	async function createHeat() {
		if (selectedDriverIds.size === 0) return;
		creating = true;
		try {
			const res = await kcFetch('/api/rallycross/heat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ driver_ids: [...selectedDriverIds] })
			});
			if (!res.ok) throw new Error(await res.text());
			selectedDriverIds = new Set();
			await loadAll();
		} catch (e) {
			alert(t.rxCreateFailed + (e as Error).message);
		} finally {
			creating = false;
		}
	}

	async function startHeat(heatId: number) {
		starting = true;
		try {
			const res = await kcFetch(`/api/rallycross/heat/${heatId}/start`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await loadAll();
		} catch (e) {
			alert(t.rxStartFailed + (e as Error).message);
		} finally {
			starting = false;
		}
	}

	async function closeHeat(heatId: number) {
		closing = true;
		try {
			const res = await kcFetch(`/api/rallycross/heat/${heatId}/close`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			closeModalOpen = false;
			await loadAll();
		} catch (e) {
			alert(t.rxCloseFailed + (e as Error).message);
		} finally {
			closing = false;
		}
	}

	$effect(() => {
		loadAll();
		const timer = setInterval(loadAll, 2000);
		return () => clearInterval(timer);
	});
</script>

<div class="mx-auto w-full max-w-4xl space-y-6 p-5">
	<div class="flex items-center gap-3">
		<a
			href="/rallycross"
			class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
		>
			<ArrowLeftOutline size="sm" /> {t.rxBack}
		</a>
		<h1 class="text-xl font-semibold">{t.rxManageHeatsHeading}</h1>
	</div>

	<!-- Active heat -->
	{#if rx.active_heat}
		<Card class="max-w-none p-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<p class="font-semibold">{t.rxHeatLabel(rx.active_heat.number)}</p>
					<Badge color="green">{t.rxStatusInProgress}</Badge>
				</div>
				{#if $isAdmin}
					<Button color="red" size="sm" onclick={() => (closeModalOpen = true)} disabled={closing}>
						<StopOutline size="sm" class="mr-1" /> {t.rxCloseHeat}
					</Button>
				{/if}
			</div>

			<p class="mb-3 text-sm text-gray-500">
				{t.rxRequiredLaps(rx.active_heat.required_laps)}
			</p>

			{#if activeHeatResults.length}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
								<th class="pb-1 pr-4">#</th>
								<th class="pb-1 pr-4">{t.driverHeader}</th>
								<th class="pb-1 pr-4 text-right">{t.rxLapsColumn}</th>
								<th class="pb-1 pr-4 text-right">{t.rxBestLap}</th>
								<th class="pb-1 text-right">{t.totalLabel}</th>
							</tr>
						</thead>
						<tbody>
							{#each activeHeatResults as r, i (r.driver_id)}
								<tr
									class="border-b border-gray-100 dark:border-gray-800 {r.finished
										? 'text-gray-900 dark:text-white'
										: 'text-gray-500 dark:text-gray-400'}"
								>
									<td class="py-1.5 pr-4 font-mono">{r.finished ? i + 1 : '—'}</td>
									<td class="py-1.5 pr-4">
										<span class="font-medium">{r.driver_name}</span>
										<span class="ml-1 text-xs opacity-60">{r.class_name}</span>
										{#if r.dnf}<Badge color="red" class="ml-1 text-xs">DNF</Badge>{/if}
									</td>
									<td class="py-1.5 pr-4 text-right font-mono">
										{r.lap_count}/{rx.active_heat.required_laps}
									</td>
									<td class="py-1.5 pr-4 text-right font-mono">{formatMs(r.best_lap_ms)}</td>
									<td class="py-1.5 text-right font-mono">{formatMs(r.total_ms)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-sm text-gray-500">{t.rxWaitingForDrivers}</p>
			{/if}
		</Card>
	{:else}
		<!-- Not-started heat waiting to be started -->
		{@const pendingHeat = rx.heats.find((h) => h.started_at === null)}
		{#if pendingHeat}
			<Card class="max-w-none p-4">
				<div class="mb-3 flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<p class="font-semibold">{t.rxHeatLabel(pendingHeat.number)}</p>
						<Badge color="yellow">{t.rxStatusNotStarted}</Badge>
					</div>
					{#if $isAdmin}
						<Button
							color="green"
							size="sm"
							onclick={() => startHeat(pendingHeat.id)}
							disabled={starting || !rx.gate_id}
						>
							<PlayOutline size="sm" class="mr-1" />
							{starting ? t.rxStartingHeat : t.rxStartHeat}
						</Button>
					{/if}
				</div>
				{#if !rx.gate_id}
					<p class="text-sm text-yellow-600">{t.rxAssignGateBeforeStart}</p>
				{/if}
			</Card>
		{/if}

		<!-- Create new heat -->
		{#if $isAdmin && !pendingHeat}
			<Card class="max-w-none p-4">
				<p class="mb-3 font-semibold">{t.rxCreateNextHeat}</p>

				{#if suggestedGroups.length}
					<div class="mb-4">
						<p class="mb-2 text-sm text-gray-500">{t.rxSuggestedGroups}</p>
						<div class="flex flex-wrap gap-2">
							{#each suggestedGroups as group, gi}
								<Button
									size="xs"
									color={[...selectedDriverIds].sort().join() ===
									[...group].sort((a, b) => a - b).join()
										? 'blue'
										: 'alternative'}
									onclick={() => selectGroup(group)}
								>
									{t.rxGroupLabel(gi + 1)}
									({group.map((id) => standings.find((s) => s.driver_id === id)?.driver_name ?? id).join(', ')})
								</Button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="mb-4">
					<p class="mb-2 text-sm text-gray-500">
						{t.rxSelectDrivers(selectedDriverIds.size, rx.max_per_heat)}
					</p>
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{#each standings as s (s.driver_id)}
							<div class="flex items-center gap-2">
								<Checkbox
									checked={selectedDriverIds.has(s.driver_id)}
									onchange={() => toggleDriver(s.driver_id)}
								/>
								<div>
									<span class="text-sm font-medium">{s.driver_name}</span>
									<span class="ml-1 text-xs text-gray-500">{s.class_name}</span>
								</div>
							</div>
						{/each}
					</div>
					{#if tooManySelected}
						<p class="mt-2 text-sm text-yellow-600">
							{t.rxTooManyDrivers(rx.max_per_heat)}
						</p>
					{/if}
				</div>

				<Button
					color="blue"
					onclick={createHeat}
					disabled={creating || selectedDriverIds.size === 0 || tooManySelected}
				>
					{creating ? t.creating : t.rxCreateHeat(selectedDriverIds.size)}
				</Button>
			</Card>
		{/if}
	{/if}

	<!-- Completed heats summary -->
	{#if rx.heats.filter((h) => h.closed_at !== null).length}
		<Card class="max-w-none p-4">
			<p class="mb-3 font-semibold">{t.rxCompletedHeats}</p>
			<div class="space-y-1">
				{#each rx.heats.filter((h) => h.closed_at !== null) as h}
					<div class="flex items-center justify-between rounded px-2 py-1 text-sm">
						<span>{t.rxHeatLabel(h.number)}</span>
						<Badge color="gray">{t.rxStatusDone}</Badge>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</div>

<Modal title={t.rxCloseHeatTitle} bind:open={closeModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<p class="text-gray-700 dark:text-gray-300">
			{t.rxCloseHeatDescription(rx.active_heat?.required_laps ?? 0)}
		</p>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (closeModalOpen = false)}>{t.cancel}</Button>
			<Button
				color="red"
				onclick={() => rx.active_heat && closeHeat(rx.active_heat.id)}
				disabled={closing}
			>
				{closing ? t.rxClosingHeat : t.rxCloseHeat}
			</Button>
		</div>
	</div>
</Modal>
