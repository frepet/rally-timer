<script lang="ts">
	import { Card, Button, Input, Select, Badge, Modal, Toggle, Checkbox } from 'flowbite-svelte';
	import { RefreshOutline, AwardOutline, PlayOutline, StopOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { SvelteSet } from 'svelte/reactivity';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';
	import { formatMs } from '../../lib/results';
	import { t } from '../../lib/stores/locale.svelte';
	import type { OverallResult, HeatResult } from '../../lib/domain/rallycross';

	type Gate = { id: string; name: string | null; last_seen: number; stage_id: number | null };
	type HeatRow = {
		id: number;
		number: number;
		required_laps: number;
		started_at: number | null;
		closed_at: number | null;
		drivers: string[];
	};
	type RallycrossState = {
		gate_id: string | null;
		gate_name: string | null;
		cooldown_ms: number;
		started_at: number | null;
		max_per_heat: number;
		required_laps: number;
		heats: HeatRow[];
		active_heat: {
			id: number;
			number: number;
			required_laps: number;
			started_at: number;
			closed_at: null;
		} | null;
	};
	type Driver = { id: number; name: string; class_name: string | null; active: boolean };
	type DriverStanding = {
		driver_id: number;
		driver_name: string;
		class_id: number;
		class_name: string;
		best_total_ms: number | null;
		heat_count: number;
	};
	type Championship = { id: string; name: string };

	let rx = $state<RallycrossState>({
		gate_id: null,
		gate_name: null,
		cooldown_ms: 10000,
		started_at: null,
		max_per_heat: 4,
		required_laps: 3,
		heats: [],
		active_heat: null
	});
	let gates = $state<Gate[]>([]);
	let leaderboard = $state<OverallResult[]>([]);
	let allDrivers = $state<Driver[]>([]);
	let championships = $state<Championship[]>([]);
	let standings = $state<DriverStanding[]>([]);
	let suggestedGroups = $state<number[][]>([]);

	// Config form
	let cooldownSecondsInput = $state(10);
	let maxPerHeatInput = $state(4);
	let requiredLapsInput = $state(3);
	let selectedGateId = $state('');
	let clearing = $state(false);
	let clearModalOpen = $state(false);

	// Heat management
	let selectedDriverIds = $state(new Set<number>());
	let closeModalOpen = $state(false);
	let creating = $state(false);
	let starting = $state(false);
	let closing = $state(false);

	// Active drivers modal
	let driversModalOpen = $state(false);
	let driverSearch = $state('');
	const filteredDrivers = $derived.by(() => {
		const q = driverSearch.trim().toLowerCase();
		return allDrivers.filter(
			(d) => !q || d.name.toLowerCase().includes(q) || (d.class_name ?? '').toLowerCase().includes(q)
		);
	});

	// Submit modal
	let submitModalOpen = $state(false);
	let submitName = $state('');
	let selectedChampIds = new SvelteSet<string>();
	let submitting = $state(false);
	let submitSuccess = $state<string | null>(null);

	const eligibleGates = $derived(gates.filter((g) => g.stage_id === null));

	const heatResultsByHeat = $derived.by(() => {
		const map = new Map<number, HeatResult[]>();
		for (const r of leaderboard) {
			for (const hr of r.heat_results) {
				const arr = map.get(hr.heat_number) ?? [];
				arr.push(hr);
				map.set(hr.heat_number, arr);
			}
		}
		for (const results of map.values()) {
			results.sort((a, b) => {
				if (a.finished !== b.finished) return a.finished ? -1 : 1;
				if (a.finished && b.finished) return (a.total_ms ?? 0) - (b.total_ms ?? 0);
				if (a.dnf !== b.dnf) return a.dnf ? -1 : 1;
				return b.lap_count - a.lap_count;
			});
		}
		return map;
	});

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

	async function loadState(syncForm = false) {
		const res = await fetch('/api/rallycross');
		if (!res.ok) return;
		rx = (await res.json()) as RallycrossState;
		if (syncForm) {
			cooldownSecondsInput = Math.round(rx.cooldown_ms / 1000);
			maxPerHeatInput = rx.max_per_heat;
			requiredLapsInput = rx.required_laps;
			selectedGateId = rx.gate_id ?? '';
		}
	}

	async function loadLeaderboard() {
		const res = await fetch('/api/rallycross/leaderboard');
		if (!res.ok) return;
		leaderboard = await res.json();
	}

	async function loadSuggest() {
		const res = await fetch('/api/rallycross/suggest-heat');
		if (!res.ok) return;
		const data = await res.json();
		suggestedGroups = data.groups ?? [];
		standings = data.standings ?? [];
	}

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	async function loadAllDrivers() {
		const res = await kcFetch('/api/driver');
		if (!res.ok) return;
		allDrivers = await res.json();
	}

	async function toggleDriver(id: number, active: boolean) {
		await kcFetch(`/api/driver/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ active })
		});
		const d = allDrivers.find((x) => x.id === id);
		if (d) d.active = active;
	}

	async function openSubmitModal() {
		const res = await fetch('/api/championship');
		if (res.ok) championships = await res.json();
		selectedChampIds.clear();
		submitName = '';
		submitSuccess = null;
		submitModalOpen = true;
	}

	function toggleChampionship(id: string) {
		if (selectedChampIds.has(id)) selectedChampIds.delete(id);
		else selectedChampIds.add(id);
	}

	async function submitRallycross() {
		if (!submitName.trim() || selectedChampIds.size === 0) return;
		submitting = true;
		try {
			const res = await kcFetch('/api/rallycross/submit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: submitName.trim(), championship_ids: [...selectedChampIds] })
			});
			if (!res.ok) throw new Error(await res.text());
			const { id } = (await res.json()) as { id: string };
			submitSuccess = id;
		} catch (e) {
			alert(t.rxSubmitFailed + (e as Error).message);
		} finally {
			submitting = false;
		}
	}

	async function saveConfig() {
		try {
			const cooldown_ms = Math.max(0, Math.round(cooldownSecondsInput * 1000));
			const gate_id = selectedGateId || null;
			const res = await kcFetch('/api/rallycross', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					gate_id,
					cooldown_ms,
					max_per_heat: maxPerHeatInput,
					required_laps: requiredLapsInput
				})
			});
			if (!res.ok) throw new Error(await res.text());
			await Promise.all([loadState(true), loadGates()]);
		} catch (e) {
			alert(t.rxSaveFailed + (e as Error).message);
		}
	}

	async function clearSession() {
		clearing = true;
		try {
			const res = await kcFetch('/api/rallycross', { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			clearModalOpen = false;
			await Promise.all([loadState(true), loadLeaderboard(), loadSuggest()]);
		} catch (e) {
			alert(t.rxClearFailed + (e as Error).message);
		} finally {
			clearing = false;
		}
	}

	function selectGroup(group: number[]) {
		selectedDriverIds = new Set(group);
	}

	function toggleDriverSelection(id: number) {
		const next = new Set(selectedDriverIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedDriverIds = next;
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
			await Promise.all([loadState(), loadLeaderboard(), loadSuggest()]);
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
			await Promise.all([loadState(), loadLeaderboard()]);
		} catch (e) {
			alert(t.rxStartFailed + (e as Error).message);
		} finally {
			starting = false;
		}
	}

	async function deleteHeat(heatId: number, heatNumber: number) {
		if (!confirm(t.rxDeleteHeatConfirm(heatNumber))) return;
		try {
			const res = await kcFetch(`/api/rallycross/heat/${heatId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			await Promise.all([loadState(), loadLeaderboard(), loadSuggest()]);
		} catch (e) {
			alert(t.rxDeleteHeatFailed + (e as Error).message);
		}
	}

	async function closeHeat(heatId: number) {
		closing = true;
		try {
			const res = await kcFetch(`/api/rallycross/heat/${heatId}/close`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			closeModalOpen = false;
			await Promise.all([loadState(), loadLeaderboard(), loadSuggest()]);
		} catch (e) {
			alert(t.rxCloseFailed + (e as Error).message);
		} finally {
			closing = false;
		}
	}

	$effect(() => {
		loadState(true);
		loadGates();
		loadLeaderboard();
		loadAllDrivers();
		loadSuggest();
		const timer = setInterval(() => {
			loadState();
			loadLeaderboard();
			loadSuggest();
		}, 2000);
		return () => clearInterval(timer);
	});
</script>

<div class="mx-auto w-full max-w-5xl space-y-6 p-5">
	<!-- Config card -->
	<Card class="max-w-none p-4">
		<div class="mb-3 flex items-baseline justify-between gap-2">
			<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
				{t.rxHeading}
			</p>
			<div class="flex items-center gap-2">
				{#if rx.active_heat}
					<Badge color="green">{t.rxStatusHeatInProgress(rx.active_heat.number)}</Badge>
				{:else if rx.heats.length}
					<Badge color="gray">{t.rxStatusHeatsRun(rx.heats.length)}</Badge>
				{:else}
					<Badge color="gray">{t.rxStatusNotStarted}</Badge>
				{/if}
			</div>
		</div>

		{#if $isAdmin}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div>
					<label for="rxGate" class="mb-1 block text-sm font-medium">{t.rxFinishGate}</label>
					<Select id="rxGate" bind:value={selectedGateId} onchange={saveConfig}>
						<option value="">{t.rxChooseGate}</option>
						{#each eligibleGates as g (g.id)}
							<option value={g.id}>{g.name ?? g.id.slice(0, 8)}</option>
						{/each}
					</Select>
				</div>
				<div>
					<label for="rxCooldown" class="mb-1 block text-sm font-medium">{t.rxCooldownLabel}</label>
					<Input
						id="rxCooldown"
						type="number"
						min="0"
						step="0.1"
						bind:value={cooldownSecondsInput}
						onchange={saveConfig}
					/>
				</div>
				<div>
					<label for="rxMax" class="mb-1 block text-sm font-medium">{t.rxMaxPerHeat}</label>
					<Input id="rxMax" type="number" min="1" step="1" bind:value={maxPerHeatInput} onchange={saveConfig} />
				</div>
				<div>
					<label for="rxLaps" class="mb-1 block text-sm font-medium">{t.rxLapsLabel}</label>
					<Input id="rxLaps" type="number" min="1" step="1" bind:value={requiredLapsInput} onchange={saveConfig} />
				</div>
			</div>

			<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
				<Button color="alternative" onclick={() => (driversModalOpen = true)}>
					{t.activeDriversButton}
				</Button>
				{#if leaderboard.length}
					<Button color="alternative" onclick={openSubmitModal}>
						<AwardOutline size="sm" class="mr-1" />
						{t.submitToChampionshipButton}
					</Button>
				{/if}
				{#if !rx.gate_id}
					<span class="text-xs text-gray-500">{t.rxAssignGateFirst}</span>
				{/if}
				{#if rx.heats.length}
					<button
						type="button"
						class="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
						onclick={() => (clearModalOpen = true)}
					>
						<RefreshOutline size="sm" /> {t.rxClearHeading}
					</button>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				{t.rxConfigSummary(
					rx.gate_name ?? '—',
					Math.round(rx.cooldown_ms / 1000),
					rx.max_per_heat,
					rx.required_laps
				)}
			</p>
		{/if}
	</Card>

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
			<p class="mb-3 text-sm text-gray-500">{t.rxRequiredLaps(rx.active_heat.required_laps)}</p>
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
		{@const pendingHeat = rx.heats.find((h) => h.started_at === null)}
		{#if pendingHeat}
			<!-- Pending heat waiting to start -->
			<Card class="max-w-none p-4">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<p class="font-semibold">{t.rxHeatLabel(pendingHeat.number)}</p>
						<Badge color="yellow">{t.rxStatusNotStarted}</Badge>
					</div>
					{#if $isAdmin}
						<Button
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
					<p class="mt-2 text-sm text-yellow-600">{t.rxAssignGateBeforeStart}</p>
				{/if}
			</Card>
		{:else if $isAdmin}
			<!-- Create next heat -->
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
									onchange={() => toggleDriverSelection(s.driver_id)}
								/>
								<div>
									<span class="text-sm font-medium">{s.driver_name}</span>
									<span class="ml-1 text-xs text-gray-500">{s.class_name}</span>
									<span class="ml-1 text-xs text-gray-400">· {t.rxHeatCount(s.heat_count)}</span>
								</div>
							</div>
						{/each}
					</div>
					{#if tooManySelected}
						<p class="mt-2 text-sm text-yellow-600">{t.rxTooManyDrivers(rx.max_per_heat)}</p>
					{/if}
				</div>

				<Button
					onclick={createHeat}
					disabled={creating || selectedDriverIds.size === 0 || tooManySelected}
				>
					{creating ? t.creating : t.rxCreateHeat(selectedDriverIds.size)}
				</Button>
			</Card>
		{/if}
	{/if}

	<!-- Heat list -->
	{#if rx.heats.length}
		<Card class="max-w-none p-4">
			<p class="mb-3 font-semibold">{t.rxHeatsHeading}</p>
			<div class="space-y-1">
				{#each rx.heats as h (h.id)}
					<div class="rounded px-2 py-1.5 text-sm odd:bg-gray-50 dark:odd:bg-gray-700/30">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="font-medium">{t.rxHeatLabel(h.number)}</span>
								{#if h.closed_at !== null}
									<Badge color="gray">{t.rxStatusDone}</Badge>
								{:else if h.started_at !== null}
									<Badge color="green">{t.rxStatusInProgress}</Badge>
								{:else}
									<Badge color="yellow">{t.rxStatusNotStarted}</Badge>
								{/if}
							</div>
							{#if $isAdmin}
								<button
									type="button"
									class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700 dark:hover:text-red-400"
									onclick={() => deleteHeat(h.id, h.number)}
								>
									<TrashBinOutline size="xs" />
								</button>
							{/if}
						</div>
						{#if h.closed_at !== null}
							{@const results = heatResultsByHeat.get(h.number) ?? []}
							{#if results.length}
								<p class="mt-0.5 text-xs text-gray-400">
									{results.map((r, i) => `${i + 1}. ${r.driver_name}: ${formatMs(r.total_ms)}`).join(' · ')}
								</p>
							{/if}
						{:else if h.drivers.length}
							<p class="mt-0.5 text-xs text-gray-400">{h.drivers.join(', ')}</p>
						{/if}
					</div>
				{/each}
			</div>
		</Card>
	{/if}

	<!-- Overall leaderboard -->
	{#if leaderboard.length}
		<Card class="max-w-none p-4">
			<p class="mb-3 font-semibold">{t.rxOverallStandings}</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
							<th class="pb-1 pr-4">#</th>
							<th class="pb-1 pr-4">{t.driverHeader}</th>
							<th class="pb-1 pr-4 text-right">{t.rxPoints}</th>
							<th class="pb-1 text-right">{t.rxBestTime}</th>
						</tr>
					</thead>
					<tbody>
						{#each leaderboard as r, i (r.driver_id)}
							<tr
								class="border-b border-gray-100 dark:border-gray-800 {r.best_total_ms !== null
									? 'text-gray-900 dark:text-white'
									: 'text-gray-400 dark:text-gray-500'}"
							>
								<td class="py-1.5 pr-4 font-mono font-semibold">
									{r.best_total_ms !== null ? i + 1 : '—'}
								</td>
								<td class="py-1.5 pr-4">
									<span class="font-medium">{r.driver_name}</span>
									<span class="ml-1 text-xs opacity-60">{r.class_name}</span>
								</td>
								<td class="py-1.5 pr-4 text-right font-mono font-semibold">{r.total_points}</td>
								<td class="py-1.5 text-right font-mono text-xs text-gray-500">{formatMs(r.best_total_ms)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</div>

<!-- Active Drivers Modal -->
<Modal title={t.activeDriversModal} bind:open={driversModalOpen} size="md" autoclose={false}>
	<div class="mb-3">
		<Input size="sm" placeholder={t.searchDriversPlaceholder} bind:value={driverSearch} />
	</div>
	<ul class="max-h-96 space-y-2 overflow-y-auto">
		{#each filteredDrivers as d (d.id)}
			<li class="flex items-center justify-between gap-2 rounded border p-2">
				<span>{d.name}{d.class_name ? ` — ${d.class_name}` : ''}</span>
				{#if $isAdmin}
					<Toggle checked={d.active} onchange={() => toggleDriver(d.id, !d.active)} size="small" />
				{:else}
					<Badge color={d.active ? 'green' : 'gray'}>{d.active ? t.active : t.inactive}</Badge>
				{/if}
			</li>
		{/each}
		{#if !filteredDrivers.length}
			<li class="text-gray-500 dark:text-gray-400">
				{driverSearch ? t.noMatches : t.noDrivers}
			</li>
		{/if}
	</ul>
	<div class="mt-4 border-t pt-3">
		<a href="/drivers" class="text-sm text-blue-600 hover:underline dark:text-blue-400">
			{t.manageAddDrivers}
		</a>
	</div>
</Modal>

<!-- Submit to Championship Modal -->
<Modal title={t.rxSubmitModal} bind:open={submitModalOpen} size="md" autoclose={false}>
	{#if submitSuccess}
		<div class="space-y-4">
			<p class="font-medium text-green-600 dark:text-green-400">{t.rxSubmitted}</p>
			<div class="flex justify-end gap-2">
				<a href="/championships" class="text-sm text-blue-600 hover:underline dark:text-blue-400">
					{t.viewChampionships}
				</a>
				<Button color="alternative" onclick={() => (submitModalOpen = false)}>{t.close}</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			<div>
				<label for="rxSubmitName" class="mb-1 block text-sm font-medium">{t.rallyNameLabel}</label>
				<Input id="rxSubmitName" bind:value={submitName} placeholder={t.rallyNamePlaceholder} />
			</div>
			<div>
				<p class="mb-2 text-sm font-medium">{t.submitToChampionshipLabel}</p>
				{#if championships.length}
					<ul class="max-h-48 space-y-1 overflow-y-auto">
						{#each championships as c (c.id)}
							<li>
								<label class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-700">
									<input
										type="checkbox"
										checked={selectedChampIds.has(c.id)}
										onchange={() => toggleChampionship(c.id)}
										class="rounded"
									/>
									<span>{c.name}</span>
								</label>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						{t.noChampionshipsYetCreate}
						<a href="/championships" class="text-blue-600 hover:underline dark:text-blue-400">{t.createOne}</a>
					</p>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t pt-3">
				<Button color="alternative" onclick={() => (submitModalOpen = false)}>{t.cancel}</Button>
				<Button
					onclick={submitRallycross}
					disabled={submitting || !submitName.trim() || selectedChampIds.size === 0}
				>
					{submitting ? t.sending : t.send}
				</Button>
			</div>
		</div>
	{/if}
</Modal>

<!-- Clear Modal -->
<Modal title={t.rxClearHeading} bind:open={clearModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<p class="text-gray-700 dark:text-gray-300">{t.rxClearDescription}</p>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (clearModalOpen = false)}>{t.cancel}</Button>
			<Button color="red" onclick={clearSession} disabled={clearing}>
				{clearing ? t.clearing : t.clearAction}
			</Button>
		</div>
	</div>
</Modal>

<!-- Close Heat Modal -->
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
