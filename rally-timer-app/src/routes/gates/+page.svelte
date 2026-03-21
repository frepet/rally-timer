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
		Badge,
		P
	} from 'flowbite-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';

	type Gate = {
		id: string;
		name: string | null;
		last_seen: number;
		stage_id: number | null;
		stage_name: string | null;
		rally_name: string | null;
		created_at: number;
	};

	let gates = $state<Gate[]>([]);
	let flashingGates = new SvelteSet<string>();

	function fmtAge(ts: number): string {
		const sec = Math.floor((Date.now() - ts) / 1000);
		if (sec < 10) return 'just now';
		if (sec < 60) return `${sec}s ago`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}m ago`;
		return `${Math.floor(min / 60)}h ago`;
	}

	function isOnline(gate: Gate): boolean {
		return Date.now() - gate.last_seen < 30000;
	}

	async function kcFetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await kcFetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadGates() {
		gates = await kcFetchJSON<Gate[]>('/api/gate');
	}

	async function updateName(gate: Gate) {
		const newName = prompt('Enter new name for gate:', gate.name ?? '');
		if (newName === null) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName.trim() || null })
		});
		await loadGates();
	}

	async function unassignGate(gate: Gate) {
		if (!confirm(`Unassign gate "${gate.name ?? gate.id}" from stage?`)) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: null })
		});
		await loadGates();
	}

	async function deleteGate(gate: Gate) {
		if (!confirm(`Delete gate "${gate.name ?? gate.id}"? This cannot be undone.`)) return;
		await kcFetch(`/api/gate/${gate.id}`, { method: 'DELETE' });
		await loadGates();
	}

	function triggerFlash(gateId: string) {
		flashingGates.add(gateId);
		setTimeout(() => {
			flashingGates.delete(gateId);
		}, 2000);
	}

	let poller: number | null = null;
	let eventSource: EventSource | null = null;

	onMount(async () => {
		await loadGates();
		poller = window.setInterval(loadGates, 5000);

		eventSource = new EventSource('/api/gate-events/stream');
		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.gate_id) {
					triggerFlash(data.gate_id);
				}
			} catch {
				/* ignore */
			}
		};
	});

	onDestroy(() => {
		if (poller) clearInterval(poller);
		if (eventSource) eventSource.close();
	});
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-4 flex items-center justify-between">
			<P class="text-2xl font-bold">Registered Gates</P>
			<P class="text-sm opacity-60">Auto-refreshes every 5s</P>
		</div>

		{#if !gates.length}
			<P class="opacity-70">No gates registered. Gates will appear here when they connect.</P>
		{:else}
			<Table hoverable>
				<TableHead>
					<TableHeadCell>Status</TableHeadCell>
					<TableHeadCell>Name / ID</TableHeadCell>
					<TableHeadCell>Assigned Stage</TableHeadCell>
					<TableHeadCell>Last Seen</TableHeadCell>
					{#if $isAdmin}
						<TableHeadCell class="text-right">Actions</TableHeadCell>
					{/if}
				</TableHead>
				<TableBody>
					{#each gates as gate (gate.id)}
						<TableBodyRow
							class={flashingGates.has(gate.id)
								? 'animate-pulse bg-green-100 dark:bg-green-900'
								: ''}
						>
							<TableBodyCell>
								{#if isOnline(gate)}
									<Badge color="green">Online</Badge>
								{:else}
									<Badge color="gray">Offline</Badge>
								{/if}
							</TableBodyCell>
							<TableBodyCell>
								<div class="font-medium">{gate.name ?? '—'}</div>
								<div class="font-mono text-xs opacity-60">{gate.id}</div>
							</TableBodyCell>
							<TableBodyCell>
								{#if gate.stage_id && gate.stage_name}
									<Badge color="blue">{gate.stage_name}</Badge>
									{#if gate.rally_name}
										<P class="text-xs opacity-60">{gate.rally_name}</P>
									{/if}
								{:else}
									<Badge color="yellow">Unassigned</Badge>
								{/if}
							</TableBodyCell>
							<TableBodyCell>
								<P class="text-sm">{fmtAge(gate.last_seen)}</P>
							</TableBodyCell>
							{#if $isAdmin}
								<TableBodyCell class="text-right">
									<div class="flex justify-end gap-2">
										<Button size="xs" onclick={() => updateName(gate)}>Rename</Button>
										{#if gate.stage_id}
											<Button size="xs" color="yellow" onclick={() => unassignGate(gate)}
												>Unassign</Button
											>
										{/if}
										<Button size="xs" color="red" onclick={() => deleteGate(gate)}>Delete</Button>
									</div>
								</TableBodyCell>
							{/if}
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</Card>

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<P class="mb-4 text-xl font-bold">Gate Identification</P>
		<P class="text-sm opacity-70">
			To identify a specific gate: wave an RFID tag in front of an unassigned gate. That gate will
			flash in the list above for 2 seconds.
		</P>
	</Card>
</div>
