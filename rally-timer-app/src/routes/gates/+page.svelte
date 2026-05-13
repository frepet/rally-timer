<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import {
		Card,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Badge,
		P
	} from 'flowbite-svelte';
	import { DotsVerticalOutline, TrashBinOutline } from 'flowbite-svelte-icons';
	import { SvelteSet } from 'svelte/reactivity';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';
	import { t } from '../../lib/stores/locale.svelte';

	type Gate = {
		id: string;
		name: string | null;
		last_seen: number;
		stage_id: number | null;
		stage_name: string | null;
		rally_name: string | null;
		is_rallycross: boolean;
		created_at: number;
	};

	type ConsoleEntry = {
		id: number;
		gate_id: string;
		tag: string;
		rssi: number | null;
		timestamp_ms: number;
	};

	let gates = $state<Gate[]>([]);
	let flashingGates = new SvelteSet<string>();
	let openMenuId = $state<string | null>(null);
	let menuPos = $state({ top: 0, right: 0 });
	let consoleLog = $state<ConsoleEntry[]>([]);
	let consoleEl: HTMLDivElement | null = null;
	let nextEntryId = 0;
	const MAX_LOG = 200;

	function openMenu(e: MouseEvent, id: string) {
		e.stopPropagation();
		if (openMenuId === id) {
			openMenuId = null;
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menuPos = { top: rect.bottom + window.scrollY, right: window.innerWidth - rect.right };
		openMenuId = id;
	}

	// Derived: the gate whose menu is currently open (for the fixed-position portal menu)
	const menuGate = $derived(gates.find((g) => g.id === openMenuId) ?? null);

	function fmtAge(ts: number): string {
		const sec = Math.floor((Date.now() - ts) / 1000);
		if (sec < 10) return t.justNow;
		if (sec < 60) return `${sec}s ${t.agoSuffix}`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}m ${t.agoSuffix}`;
		return `${Math.floor(min / 60)}h ${t.agoSuffix}`;
	}

	function fmtTime(ts: number): string {
		const dt = new Date(ts);
		const pad = (n: number, len = 2) => String(n).padStart(len, '0');
		return (
			`${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.` +
			`${pad(dt.getMilliseconds(), 3)}`
		);
	}

	function gateLabel(gate_id: string): string {
		const g = gates.find((x) => x.id === gate_id);
		return g?.name ?? gate_id.slice(0, 8);
	}

	function rssiColor(rssi: number | null): 'green' | 'yellow' | 'red' | 'gray' {
		if (rssi == null) return 'gray';
		if (rssi >= -55) return 'green';
		if (rssi >= -70) return 'yellow';
		return 'red';
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
		openMenuId = null;
		const newName = prompt(t.enterGateName, gate.name ?? '');
		if (newName === null) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName.trim() || null })
		});
		await loadGates();
	}

	async function unassignGate(gate: Gate) {
		openMenuId = null;
		if (!confirm(t.unassignGateConfirm(gate.name ?? gate.id))) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: null })
		});
		await loadGates();
	}

	async function deleteGate(gate: Gate) {
		openMenuId = null;
		if (!confirm(t.deleteGateConfirm(gate.name ?? gate.id))) return;
		await kcFetch(`/api/gate/${gate.id}`, { method: 'DELETE' });
		await loadGates();
	}

	function triggerFlash(gateId: string) {
		flashingGates.add(gateId);
		setTimeout(() => {
			flashingGates.delete(gateId);
		}, 2000);
	}

	let audioCtx: AudioContext | null = null;

	function beep() {
		if (!audioCtx) audioCtx = new AudioContext();
		audioCtx.resume().then(() => {
			const ctx = audioCtx!;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.frequency.value = 880;
			gain.gain.setValueAtTime(0.3, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
			osc.start(ctx.currentTime);
			osc.stop(ctx.currentTime + 0.3);
		});
	}

	let poller: number | null = null;
	let eventSource: EventSource | null = null;

	onMount(async () => {
		await loadGates();
		poller = window.setInterval(loadGates, 5000);

		eventSource = new EventSource('/api/gate-events/stream');
		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data) as {
					gate_id?: string;
					tag?: string;
					rssi?: number | null;
					timestamp_ms?: number;
				};
				if (!data.gate_id) return;

				triggerFlash(data.gate_id);
				beep();

				const entry: ConsoleEntry = {
					id: nextEntryId++,
					gate_id: data.gate_id,
					tag: data.tag ?? '',
					rssi: data.rssi ?? null,
					timestamp_ms: data.timestamp_ms ?? Date.now()
				};
				const next = consoleLog.concat(entry);
				consoleLog = next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;

				tick().then(() => {
					if (consoleEl) consoleEl.scrollTop = consoleEl.scrollHeight;
				});
			} catch {
				/* ignore */
			}
		};
	});

	onDestroy(() => {
		if (poller) clearInterval(poller);
		if (eventSource) eventSource.close();
		audioCtx?.close();
	});

	const menuItemClass =
		'block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600';
</script>

<svelte:window onclick={() => (openMenuId = null)} />

<!-- Fixed-position dropdown portal — rendered outside the table so it is never clipped -->
{#if menuGate}
	<div
		role="menu"
		style="position:fixed; top:{menuPos.top}px; right:{menuPos.right}px; z-index:9999;"
		class="min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && (openMenuId = null)}
	>
		<button type="button" class={menuItemClass} onclick={() => updateName(menuGate)}>
			{t.rename}
		</button>
		{#if menuGate.stage_id}
			<button type="button" class={menuItemClass} onclick={() => unassignGate(menuGate)}>
				{t.disconnect}
			</button>
		{/if}
		<button
			type="button"
			class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-600"
			onclick={() => deleteGate(menuGate)}
		>
			<TrashBinOutline size="xs" />
			{t.delete}
		</button>
	</div>
{/if}

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-4 flex items-center justify-between">
			<P class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white"
				>{t.registeredGates}</P
			>
			<P class="text-sm opacity-60">{t.autoUpdates}</P>
		</div>

		{#if !gates.length}
			<P class="opacity-70">{t.noGatesRegistered}</P>
		{:else}
			<Table hoverable>
				<TableHead>
					<TableHeadCell>{t.statusHeader}</TableHeadCell>
					<TableHeadCell>{t.nameIdHeader}</TableHeadCell>
					<TableHeadCell>{t.assignedStageHeader}</TableHeadCell>
					<TableHeadCell>{t.lastSeenHeader}</TableHeadCell>
					{#if $isAdmin}
						<TableHeadCell class="text-right">{t.actions}</TableHeadCell>
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
								{#if gate.is_rallycross}
									<Badge color="purple">{t.rxHeading}</Badge>
								{:else if gate.stage_id && gate.stage_name}
									<Badge color="blue">{gate.stage_name}</Badge>
									{#if gate.rally_name}
										<P class="text-xs opacity-60">{gate.rally_name}</P>
									{/if}
								{:else}
									<Badge color="yellow">{t.unassigned}</Badge>
								{/if}
							</TableBodyCell>
							<TableBodyCell>
								<P class="text-sm">{fmtAge(gate.last_seen)}</P>
							</TableBodyCell>
							{#if $isAdmin}
								<TableBodyCell class="text-right">
									<button
										type="button"
										onclick={(e) => openMenu(e, gate.id)}
										class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
									>
										<DotsVerticalOutline class="text-gray-500 dark:text-gray-400" size="sm" />
									</button>
								</TableBodyCell>
							{/if}
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</Card>

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-2 flex items-center justify-between">
			<P class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white"
				>{t.livePassageConsole}</P
			>
			<P class="text-sm opacity-60">{consoleLog.length} / {MAX_LOG}</P>
		</div>
		<P class="mb-3 text-sm opacity-70">{t.passageConsoleDescription}</P>
		<div
			bind:this={consoleEl}
			class="h-96 overflow-y-auto rounded-md border border-gray-200 bg-gray-900 p-3 font-mono text-xs text-gray-100 dark:border-gray-700"
		>
			{#if !consoleLog.length}
				<div class="opacity-50">{t.waitingForPassages}</div>
			{:else}
				{#each consoleLog as entry (entry.id)}
					<div class="flex items-center gap-2 py-0.5">
						<span class="text-gray-400">{fmtTime(entry.timestamp_ms)}</span>
						<span class="text-blue-300">{gateLabel(entry.gate_id)}</span>
						<span class="text-gray-400">tag=</span>
						<span class="text-yellow-200">{entry.tag}</span>
						<span class="ml-auto">
							<Badge color={rssiColor(entry.rssi)}>
								{entry.rssi != null ? `${entry.rssi} dBm` : t.noRssi}
							</Badge>
						</span>
					</div>
				{/each}
			{/if}
		</div>
	</Card>
</div>
