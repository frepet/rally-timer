<script lang="ts">
	import { Card, Button, Input, Select, Badge, Modal } from 'flowbite-svelte';
	import { PlayOutline, RefreshOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';
	import RallycrossResults from '../../lib/RallycrossResults.svelte';
	import {
		buildRallycrossLeaderboard,
		type RallycrossDriverResult
	} from '../../lib/domain/rallycross';

	type Gate = { id: string; name: string | null; last_seen: number; stage_id: number | null };
	type RallycrossDriver = {
		id: number;
		name: string;
		tag: string;
		class_id: number;
		class_name: string;
		passes: number[];
	};
	type RallycrossState = {
		gate_id: string | null;
		gate_name: string | null;
		cooldown_ms: number;
		started_at: number | null;
		drivers: RallycrossDriver[];
	};

	let rx = $state<RallycrossState>({
		gate_id: null,
		gate_name: null,
		cooldown_ms: 10000,
		started_at: null,
		drivers: []
	});
	let gates = $state<Gate[]>([]);
	let cooldownSecondsInput = $state(10);
	let selectedGateId = $state('');
	let saving = $state(false);
	let starting = $state(false);
	let clearing = $state(false);
	let clearModalOpen = $state(false);

	const eligibleGates = $derived(gates.filter((g) => g.stage_id === null));

	const results = $derived<RallycrossDriverResult[]>(
		rx.started_at
			? buildRallycrossLeaderboard(
					rx.drivers.map((d) => ({
						driver_id: d.id,
						driver_name: d.name,
						class_id: d.class_id,
						class_name: d.class_name,
						tag: d.tag,
						passes: d.passes
					})),
					rx.started_at,
					rx.cooldown_ms
				)
			: []
	);

	async function loadState() {
		const res = await fetch('/api/rallycross');
		if (!res.ok) return;
		rx = (await res.json()) as RallycrossState;
		cooldownSecondsInput = Math.round(rx.cooldown_ms / 1000);
		selectedGateId = rx.gate_id ?? '';
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
				body: JSON.stringify({ gate_id, cooldown_ms })
			});
			if (!res.ok) throw new Error(await res.text());
			await Promise.all([loadState(), loadGates()]);
		} catch (e) {
			alert('Kunde inte spara: ' + (e as Error).message);
		} finally {
			saving = false;
		}
	}

	async function massStart() {
		if (!confirm('Starta rallycross för alla aktiva förare nu?')) return;
		starting = true;
		try {
			const res = await kcFetch('/api/rallycross/start', { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await loadState();
		} catch (e) {
			alert('Kunde inte starta: ' + (e as Error).message);
		} finally {
			starting = false;
		}
	}

	async function clearSession() {
		clearing = true;
		try {
			const res = await kcFetch('/api/rallycross', { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			clearModalOpen = false;
			await loadState();
		} catch (e) {
			alert('Kunde inte rensa: ' + (e as Error).message);
		} finally {
			clearing = false;
		}
	}

	$effect(() => {
		loadState();
		loadGates();
		const t = setInterval(() => {
			loadState();
			loadGates();
		}, 1000);
		return () => clearInterval(t);
	});
</script>

<div class="mx-auto w-full max-w-5xl space-y-6 p-5">
	<Card class="max-w-none p-4">
		<div class="mb-3 flex items-baseline justify-between gap-2">
			<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
				Rallycross
			</p>
			{#if rx.started_at}
				<Badge color="green">Pågår</Badge>
			{:else}
				<Badge color="gray">Ej startat</Badge>
			{/if}
		</div>

		{#if $isAdmin}
			<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
				<div>
					<label for="rxGate" class="mb-1 block text-sm font-medium">Mållinjegrind</label>
					<Select id="rxGate" bind:value={selectedGateId}>
						<option value="">— Välj grind —</option>
						{#each eligibleGates as g (g.id)}
							<option value={g.id}>{g.name ?? g.id.slice(0, 8)}</option>
						{/each}
					</Select>
				</div>
				<div>
					<label for="rxCooldown" class="mb-1 block text-sm font-medium">Cooldown (sekunder)</label>
					<Input
						id="rxCooldown"
						type="number"
						min="0"
						step="0.1"
						bind:value={cooldownSecondsInput}
					/>
				</div>
				<div class="flex items-end">
					<Button class="w-full" onclick={saveConfig} disabled={saving}>
						{saving ? 'Sparar…' : 'Spara'}
					</Button>
				</div>
			</div>

			<div
				class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700"
			>
				<Button color="green" onclick={massStart} disabled={starting || !rx.gate_id}>
					<PlayOutline size="sm" class="mr-1" />
					{starting ? 'Startar…' : rx.started_at ? 'Starta om' : 'Masstart'}
				</Button>
				{#if rx.started_at}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
						onclick={() => (clearModalOpen = true)}
					>
						<RefreshOutline size="sm" /> Rensa rallycross
					</button>
				{/if}
				{#if !rx.gate_id}
					<span class="text-xs text-gray-500 dark:text-gray-400">
						Tilldela en grind innan masstart.
					</span>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Endast administratörer kan ändra rallycross-inställningar.
			</p>
		{/if}
	</Card>

	<RallycrossResults {results} startedAt={rx.started_at} cooldownMs={rx.cooldown_ms} />
</div>

<Modal title="Rensa rallycross" bind:open={clearModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<p class="text-gray-700 dark:text-gray-300">
			Stoppa pågående rallycross. Grinden och dess händelser behålls, men inga varv räknas förrän du
			startar igen.
		</p>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (clearModalOpen = false)}>Avbryt</Button>
			<Button color="red" onclick={clearSession} disabled={clearing}>
				{clearing ? 'Rensar…' : 'Rensa'}
			</Button>
		</div>
	</div>
</Modal>
