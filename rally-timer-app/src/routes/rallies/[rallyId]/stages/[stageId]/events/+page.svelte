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
		Input
	} from 'flowbite-svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type UnifiedEvent = {
		kind: 'start' | 'gate' | 'blip';
		id: number;
		timestamp: number;
		driver_name?: string | null;
		tag?: string | null;
	};

	let events = $state<UnifiedEvent[]>([]);
	let editingId = $state<number | null>(null);
	let editTs = $state<string>(''); // text to allow both number ms and ISO input if you paste

	function fmtMs(ms: number): string {
		const dt = new Date(ms);
		return dt.toLocaleString(); // human view
	}

	function fmtKind(k: UnifiedEvent['kind']): string {
		if (k === 'start') return 'Start';
		if (k === 'gate') return 'Gate';
		return 'Blip';
	}

	async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadEvents() {
		events = await fetchJSON<UnifiedEvent[]>(`/api/stage/${data.stageId}/events`);
	}

	function startEdit(e: UnifiedEvent) {
		editingId = e.id;
		editTs = String(e.timestamp);
	}
	function cancelEdit() {
		editingId = null;
		editTs = '';
	}

	function endpointFor(kind: UnifiedEvent['kind'], id: number): string {
		if (kind === 'start') return `/api/start-events/${id}`;
		if (kind === 'gate') return `/api/gate-events/${id}`;
		return `/api/blip-events/${id}`;
	}

	async function saveEdit(ev: UnifiedEvent) {
		const parsed = Number(editTs.trim());
		if (!Number.isFinite(parsed)) {
			alert('Enter timestamp in milliseconds since epoch (integer).');
			return;
		}
		await fetchJSON(endpointFor(ev.kind, ev.id), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ timestamp: parsed })
		});
		cancelEdit();
		await loadEvents();
	}

	async function deleteEvent(ev: UnifiedEvent) {
		if (!confirm(`Delete ${ev.kind} #${ev.id}?`)) return;
		await fetch(endpointFor(ev.kind, ev.id), { method: 'DELETE' });
		await loadEvents();
	}

	// auto-refresh
	let poller: number | null = null;
	onMount(async () => {
		await loadEvents();
		poller = window.setInterval(loadEvents, 3000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-4 text-2xl font-bold">Stage Events Timeline</h5>
		<div class="mb-4 text-sm opacity-80">
			Rally ID: {data.rallyId} • Stage ID: {data.stageId}
		</div>

		<Table hoverable>
			<TableHead>
				<TableHeadCell>Kind</TableHeadCell>
				<TableHeadCell>Timestamp (local)</TableHeadCell>
				<TableHeadCell>Epoch ms</TableHeadCell>
				<TableHeadCell>Driver / Tag</TableHeadCell>
				<TableHeadCell class="flex justify-end">Actions</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each events as e}
					<TableBodyRow>
						<TableBodyCell class="font-medium">{fmtKind(e.kind)}</TableBodyCell>

						<TableBodyCell>
							{#if editingId === e.id}
								<div class="text-sm opacity-70">{fmtMs(Number(editTs) || 0)}</div>
							{:else}
								{fmtMs(e.timestamp)}
							{/if}
						</TableBodyCell>

						<TableBodyCell class="font-mono">
							{#if editingId === e.id}
								<Input aria-label="Epoch ms" bind:value={editTs} class="w-48" />
							{:else}
								{e.timestamp}
							{/if}
						</TableBodyCell>

						<TableBodyCell>
							{#if e.kind === 'start'}
								{e.driver_name ?? '—'}
							{:else if e.kind === 'blip'}
								{e.tag ?? '—'}
							{:else}
								—
							{/if}
						</TableBodyCell>

						<TableBodyCell class="flex justify-end gap-2">
							{#if editingId === e.id}
								<Button size="xs" onclick={() => saveEdit(e)}>Save</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(e)}>Edit</Button>
								<Button size="xs" color="red" onclick={() => deleteEvent(e)}>Delete</Button>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}

				{#if !events.length}
					<TableBodyRow>
						<TableBodyCell colspan={5} class="opacity-70">No events yet.</TableBodyCell>
					</TableBodyRow>
				{/if}
			</TableBody>
		</Table>
	</Card>
</div>
