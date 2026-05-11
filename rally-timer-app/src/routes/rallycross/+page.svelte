<script lang="ts">
	import { Card, Button, Input, Select, Badge, Modal } from 'flowbite-svelte';
	import { RefreshOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';
	import { formatMs } from '../../lib/results';
	import { t } from '../../lib/stores/locale.svelte';
	import type { OverallResult } from '../../lib/domain/rallycross';

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

	let cooldownSecondsInput = $state(10);
	let maxPerHeatInput = $state(4);
	let requiredLapsInput = $state(3);
	let selectedGateId = $state('');
	let saving = $state(false);
	let clearing = $state(false);
	let clearModalOpen = $state(false);

	const eligibleGates = $derived(gates.filter((g) => g.stage_id === null));

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

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	async function saveConfig() {
		saving = true;
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
		} finally {
			saving = false;
		}
	}

	async function clearSession() {
		clearing = true;
		try {
			const res = await kcFetch('/api/rallycross', { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			clearModalOpen = false;
			await Promise.all([loadState(true), loadLeaderboard()]);
		} catch (e) {
			alert(t.rxClearFailed + (e as Error).message);
		} finally {
			clearing = false;
		}
	}

	$effect(() => {
		loadState(true);
		loadGates();
		loadLeaderboard();
		const timer = setInterval(() => {
			loadState();
			loadLeaderboard();
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
					<Select id="rxGate" bind:value={selectedGateId}>
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
					/>
				</div>
				<div>
					<label for="rxMax" class="mb-1 block text-sm font-medium">{t.rxMaxPerHeat}</label>
					<Input id="rxMax" type="number" min="1" step="1" bind:value={maxPerHeatInput} />
				</div>
				<div>
					<label for="rxLaps" class="mb-1 block text-sm font-medium">{t.rxLapsLabel}</label>
					<Input id="rxLaps" type="number" min="1" step="1" bind:value={requiredLapsInput} />
				</div>
			</div>

			<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
				<Button onclick={saveConfig} disabled={saving}>
					{saving ? t.saving : t.rxSaveSettings}
				</Button>
				<a href="/rallycross/start">
					<Button color="green" disabled={!rx.gate_id}>{t.rxManageHeats}</Button>
				</a>
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

	<!-- Heat list -->
	{#if rx.heats.length}
		<Card class="max-w-none p-4">
			<p class="mb-3 font-semibold">{t.rxHeatsHeading}</p>
			<div class="space-y-1">
				{#each rx.heats as h (h.id)}
					<div class="rounded px-2 py-1.5 text-sm odd:bg-gray-50 dark:odd:bg-gray-700/30">
						<div class="flex items-center justify-between">
							<span class="font-medium">{t.rxHeatLabel(h.number)}</span>
							{#if h.closed_at !== null}
								<Badge color="gray">{t.rxStatusDone}</Badge>
							{:else if h.started_at !== null}
								<Badge color="green">{t.rxStatusInProgress}</Badge>
							{:else}
								<Badge color="yellow">{t.rxStatusNotStarted}</Badge>
							{/if}
						</div>
						{#if h.drivers.length}
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
							<th class="pb-1 pr-4 text-right">{t.rxBestTime}</th>
							<th class="pb-1 text-right">{t.rxHeatColumn}</th>
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
								<td class="py-1.5 pr-4 text-right font-mono">{formatMs(r.best_total_ms)}</td>
								<td class="py-1.5 text-right text-xs text-gray-500">
									{r.best_heat_number !== null ? t.rxHeatLabel(r.best_heat_number) : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</div>

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
