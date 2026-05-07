<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Card,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Button,
		P,
		Badge
	} from 'flowbite-svelte';
	import { TrashBinOutline } from 'flowbite-svelte-icons';
	import type { PageProps } from './$types';
	import { kcFetch } from '../../../../lib/kcFetch';

	let { data }: PageProps = $props();

	type UnifiedEvent = {
		kind: 'start' | 'finish';
		id: number;
		timestamp: number;
		driver_name?: string | null;
		tag?: string | null;
		rssi?: number | null;
	};

	type Gate = {
		id: string;
		name: string | null;
		last_seen: number;
		stage_id: number | null;
		stage_name: string | null;
	};

	let events = $state<UnifiedEvent[]>([]);
	let gates = $state<Gate[]>([]);
	let editingKey = $state<string | null>(null);
	let editTs = $state<string>('');

	function keyOf(e: UnifiedEvent) {
		return `${e.kind}:${e.id}`;
	}

	function fmtMs(ms: number): string {
		const dt = new Date(ms);
		const pad = (n: number, len = 2) => String(n).padStart(len, '0');
		return (
			`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
			`${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.${pad(dt.getMilliseconds(), 3)}`
		);
	}

	function epochToDatetimeLocal(ms: number): string {
		const dt = new Date(ms);
		const pad = (n: number, len = 2) => String(n).padStart(len, '0');
		return (
			`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T` +
			`${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.${pad(dt.getMilliseconds(), 3)}`
		);
	}
	function fmtKind(k: UnifiedEvent['kind']): string {
		return k === 'start' ? 'Start' : 'Mål';
	}

	async function kcFetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await kcFetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadEvents() {
		if (editingKey) return;
		events = await kcFetchJSON<UnifiedEvent[]>(`/api/stage/${data.stageId}/events`);
	}

	async function loadGates() {
		gates = await kcFetchJSON<Gate[]>('/api/gate');
	}

	async function unassignGate(gate: Gate) {
		if (!confirm(`Koppla bort grinden "${gate.name ?? gate.id}" från denna sträcka?`)) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: null })
		});
		await loadGates();
	}

	function startEdit(e: UnifiedEvent) {
		editingKey = keyOf(e);
		editTs = epochToDatetimeLocal(e.timestamp);
	}
	function cancelEdit() {
		editingKey = null;
		editTs = '';
	}

	function endpointFor(kind: UnifiedEvent['kind'], id: number): string {
		return kind === 'start' ? `/api/start/${id}` : `/api/finish/${id}`;
	}

	async function saveEdit(ev: UnifiedEvent) {
		const parsed = new Date(editTs).getTime();
		if (!Number.isFinite(parsed)) {
			alert('Ogiltigt datum/tid.');
			return;
		}
		await kcFetchJSON(endpointFor(ev.kind, ev.id), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ timestamp: parsed })
		});
		cancelEdit();
		await loadEvents();
	}

	async function deleteEvent(ev: UnifiedEvent) {
		if (!confirm(`Ta bort ${fmtKind(ev.kind)} #${ev.id}?`)) return;
		await kcFetch(endpointFor(ev.kind, ev.id), { method: 'DELETE' });
		await loadEvents();
	}

	function isOnline(gate: Gate): boolean {
		return Date.now() - gate.last_seen < 30000;
	}

	function driverFromTag(tag: string | null | undefined) {
		return data.bundle.drivers.find((d) => d.rfid_tag === tag)?.name ?? '—';
	}

	const stageName = $derived(
		data.bundle.stages.find((s) => s.id === data.stageId)?.name ?? `#${data.stageId}`
	);

	let poller: number | null = null;
	onMount(async () => {
		await Promise.all([loadEvents(), loadGates()]);
		poller = window.setInterval(async () => {
			await loadGates();
		}, 5000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});

	const assignedGates = $derived(gates.filter((g) => g.stage_id === data.stageId));
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-4">
			<P class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white"
				>Händelser för {stageName}</P
			>
		</div>

		{#if assignedGates.length}
			<div class="mb-4 flex flex-wrap gap-2">
				{#each assignedGates as g (g.id)}
					<div
						class="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
					>
						<span class="font-medium">{g.name ?? g.id.slice(0, 8)}</span>
						{#if isOnline(g)}
							<Badge color="green" class="ml-1">Online</Badge>
						{:else}
							<Badge color="gray" class="ml-1">Offline</Badge>
						{/if}
						<button
							class="ml-1 text-red-500 hover:text-red-700"
							onclick={() => unassignGate(g)}
							title="Koppla bort grind">×</button
						>
					</div>
				{/each}
			</div>
		{:else}
			<P class="mb-4 text-sm text-yellow-600 dark:text-yellow-400">
				Ingen grind tilldelad. Tilldela en grind från Sträckor-sidan för att ta emot RFID-händelser
				automatiskt.
			</P>
		{/if}

		<Table hoverable>
			<TableHead>
				<TableHeadCell>Typ</TableHeadCell>
				<TableHeadCell>Tidsstämpel (lokal)</TableHeadCell>
				<TableHeadCell>Epoch ms</TableHeadCell>
				<TableHeadCell>Förare (tagg)</TableHeadCell>
				<TableHeadCell>RSSI</TableHeadCell>
				<TableHeadCell class="flex justify-end">Åtgärder</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each events as e (keyOf(e))}
					<TableBodyRow>
						<TableBodyCell class="font-medium">{fmtKind(e.kind)}</TableBodyCell>

						<TableBodyCell>
							{#if editingKey === keyOf(e)}
								<input
									type="datetime-local"
									step="0.001"
									bind:value={editTs}
									aria-label="Tidsstämpel"
									class="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
								/>
							{:else}
								{fmtMs(e.timestamp)}
							{/if}
						</TableBodyCell>

						<TableBodyCell class="font-mono">{e.timestamp}</TableBodyCell>

						<TableBodyCell>
							{#if e.kind === 'start'}
								{e.driver_name ?? '—'}
							{:else}
								{driverFromTag(e.tag)} ({e.tag})
							{/if}
						</TableBodyCell>

						<TableBodyCell class="font-mono">
							{e.rssi != null ? `${e.rssi} dBm` : '—'}
						</TableBodyCell>

						<TableBodyCell class="flex justify-end gap-2">
							{#if editingKey === keyOf(e)}
								<Button size="xs" onclick={() => saveEdit(e)}>Spara</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>Avbryt</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(e)}>Redigera</Button>
								<Button size="xs" color="red" onclick={() => deleteEvent(e)}
									><TrashBinOutline size="xs" /></Button
								>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}

				{#if !events.length}
					<TableBodyRow>
						<TableBodyCell colspan={6} class="opacity-70">Inga händelser än.</TableBodyCell>
					</TableBodyRow>
				{/if}
			</TableBody>
		</Table>
	</Card>
</div>
