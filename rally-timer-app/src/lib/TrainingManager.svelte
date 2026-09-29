<script lang="ts">
	import { availableEventGates, eventApiUrl } from '$lib/domain/eventPresentation';
	let { eventId }: { eventId: number } = $props();
	function kcFetch(url: string, init?: RequestInit): Promise<Response> {
		return authenticatedFetch(eventApiUrl(url, eventId), init);
	}
	import { Button, Input, Select, Modal, Badge } from 'flowbite-svelte';
	import { RefreshOutline } from 'flowbite-svelte-icons';
	import { kcFetch as authenticatedFetch } from '$lib/kcFetch';
	import { startLiveRefresh } from '$lib/liveRefresh';
	import { auth } from '$lib/stores/auth.svelte';
	import { t } from '$lib/stores/locale.svelte';
	import { playBeep, closeAudio } from '$lib/beep';
	import type { TrainingDriverResult } from '$lib/domain/training';
	import TrainingResults from '$lib/TrainingResults.svelte';

	type Gate = {
		id: string;
		name: string | null;
		last_seen: number;
		stage_id: number | null;
		assigned_event_id?: number | null;
	};
	type TrainingState = {
		gate_id: string | null;
		gate_name: string | null;
		cooldown_ms: number;
		started_at: number | null;
		drivers: TrainingDriverResult[];
	};

	let tr = $state<TrainingState>({
		gate_id: null,
		gate_name: null,
		cooldown_ms: 10000,
		started_at: null,
		drivers: []
	});
	let gates = $state<Gate[]>([]);

	let cooldownSecondsInput = $state(10);
	let selectedGateId = $state('');
	let savingGate = $state(false);
	let clearing = $state(false);
	let clearModalOpen = $state(false);

	const eligibleGates = $derived(availableEventGates(gates, eventId));

	type DriverSnapshot = { last_pass_ms: number | null; lap_count: number };
	let prevDriverState = new Map<number, DriverSnapshot>();

	async function loadState(syncForm = false) {
		const res = await kcFetch('/api/training');
		if (!res.ok) return;
		const newState = (await res.json()) as TrainingState;

		for (const driver of newState.drivers) {
			const prev = prevDriverState.get(driver.driver_id);
			if (prev && driver.last_pass_ms !== null && driver.last_pass_ms !== prev.last_pass_ms) {
				if (driver.lap_count > prev.lap_count) {
					playBeep(880, 0.3, 0.5);
				} else {
					playBeep(440, 0.2, 0.35);
				}
			}
		}
		prevDriverState = new Map(
			newState.drivers.map((d) => [
				d.driver_id,
				{ last_pass_ms: d.last_pass_ms, lap_count: d.lap_count }
			])
		);

		tr = newState;
		if (syncForm) {
			cooldownSecondsInput = Math.round(tr.cooldown_ms / 1000);
			selectedGateId = tr.gate_id ?? '';
		}
	}

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	async function saveGate() {
		savingGate = true;
		try {
			const gate_id = selectedGateId || null;
			const res = await kcFetch('/api/training', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ gate_id })
			});
			if (!res.ok) throw new Error(await res.text());
			await Promise.all([loadState(true), loadGates()]);
		} catch (e) {
			alert(t.trainingSaveFailed + (e as Error).message);
			selectedGateId = tr.gate_id ?? '';
		} finally {
			savingGate = false;
		}
	}

	async function unassignGate() {
		selectedGateId = '';
		await saveGate();
	}

	async function saveCooldown() {
		try {
			const cooldown_ms = Math.max(0, Math.round(cooldownSecondsInput * 1000));
			const res = await kcFetch('/api/training', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cooldown_ms })
			});
			if (!res.ok) throw new Error(await res.text());
			await loadState(true);
		} catch (e) {
			alert(t.trainingSaveFailed + (e as Error).message);
		}
	}

	async function clearSession() {
		clearing = true;
		try {
			const res = await kcFetch('/api/training', { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			clearModalOpen = false;
			await loadState(true);
		} catch (e) {
			alert(t.trainingClearFailed + (e as Error).message);
		} finally {
			clearing = false;
		}
	}

	async function deleteLap(gateEventId: number) {
		if (!confirm(t.trainingDeleteLapConfirm)) return;
		try {
			const res = await kcFetch(`/api/training/event/${gateEventId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			await loadState();
		} catch (e) {
			alert(t.trainingDeleteLapFailed + (e as Error).message);
		}
	}

	function formatStarted(ms: number | null): string {
		if (ms === null) return '—';
		return new Date(ms).toLocaleString();
	}

	$effect(() => {
		loadState(true);
		loadGates();
		const stopLive = startLiveRefresh(() => loadState(), 10000, eventId);
		return () => {
			stopLive();
			closeAudio();
		};
	});
</script>

<div class="page">
	<!-- Config card -->
	<section class="panel panel-body">
		<div class="mb-3 flex items-baseline justify-between gap-2">
			<p class="panel-title">
				{t.trainingHeading}
			</p>
			{#if tr.started_at !== null}
				<Badge color="green">{t.trainingSessionStarted(formatStarted(tr.started_at))}</Badge>
			{/if}
		</div>

		{#if auth.isAdmin}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div>
					<label for="trainingGate" class="field-label">{t.trainingGateLabel}</label>
					<div class="flex items-center gap-2">
						<div class="min-w-0 flex-1">
							<Select
								id="trainingGate"
								bind:value={selectedGateId}
								onchange={saveGate}
								disabled={savingGate}
							>
								<option value="">{t.trainingNoGateOption}</option>
								{#each eligibleGates as g (g.id)}
									<option value={g.id}>{g.name ?? g.id.slice(0, 8)}</option>
								{/each}
							</Select>
						</div>
						{#if tr.gate_id}
							<Button color="alternative" size="sm" onclick={unassignGate} disabled={savingGate}
								>{t.trainingUnassignGate}</Button
							>
						{/if}
					</div>
				</div>
				<div>
					<label for="trainingCooldown" class="field-label">{t.trainingCooldownLabel}</label>
					<Input
						id="trainingCooldown"
						type="number"
						min="0"
						step="0.1"
						bind:value={cooldownSecondsInput}
						onchange={saveCooldown}
					/>
				</div>
			</div>

			{#if tr.gate_id}
				<div
					class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700"
				>
					<button
						type="button"
						class="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
						onclick={() => (clearModalOpen = true)}
					>
						<RefreshOutline size="sm" />
						{t.trainingClearButton}
					</button>
				</div>
			{/if}
		{:else if tr.gate_name}
			<p class="text-sm text-surface-500 dark:text-surface-400">
				{t.trainingGateLabel}: {tr.gate_name} · {t.trainingCooldownLabel.replace(' (s)', '')}: {Math.round(
					tr.cooldown_ms / 1000
				)}s
			</p>
		{/if}

		{#if !tr.gate_id}
			<p class="mt-3 text-sm text-surface-500 dark:text-surface-400">{t.trainingNoGate}</p>
		{/if}
	</section>

	<TrainingResults drivers={tr.drivers} onDeleteLap={deleteLap} />
</div>

<!-- Clear modal -->
<Modal title={t.trainingClearHeading} bind:open={clearModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<p class="text-gray-700 dark:text-gray-300">{t.trainingClearDescription}</p>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (clearModalOpen = false)}>{t.cancel}</Button>
			<Button color="red" onclick={clearSession} disabled={clearing}>
				{clearing ? t.clearing : t.trainingNewSessionConfirm}
			</Button>
		</div>
	</div>
</Modal>
