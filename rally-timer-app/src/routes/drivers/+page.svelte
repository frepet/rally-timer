<script lang="ts">
	import { kcFetch } from '../../lib/kcFetch';
	import type { PageProps } from './$types';
	import {
		Card,
		Button,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Input,
		Select,
		Toggle,
		Badge
	} from 'flowbite-svelte';
	import { TrashBinOutline } from 'flowbite-svelte-icons';

	type Driver = {
		id: number;
		name: string;
		class_id: number | null;
		tag: string | null;
		class_name?: string;
	};
	type ClassItem = { id: number; name: string };
	type Gate = {
		id: string;
		name: string | null;
		last_seen: number;
		stage_id: number | null;
	};

	let { data }: PageProps = $props();
	let drivers: Driver[] = $state(data.drivers as Driver[]);
	const apiPath = '/api/driver';

	// Create form
	let newName = $state('');
	let newClassId: number | '' = $state('');
	let newTag = $state('');
	let classes: ClassItem[] = $state([]);

	// Gate selection for tag capture
	let gates: Gate[] = $state([]);
	let selectedGateId: string | null = $state(null);
	let gateCaptureEnabled = $state(false);
	let autoSubmitEnabled = $state(false);
	let selectedGate = $derived(gates.find((g) => g.id === selectedGateId));

	function isGateOnline(gate: Gate): boolean {
		return Date.now() - gate.last_seen < 30000;
	}

	async function loadGates() {
		try {
			const res = await kcFetch('/api/gate');
			if (res.ok) {
				gates = await res.json();
			}
		} catch {
			// ignore
		}
	}

	// Remember last selected class in localStorage
	const LS_KEY = 'rally:lastClassId';
	function getLastClassId(): number | '' {
		const raw = localStorage.getItem(LS_KEY);
		const n = raw ? Number(raw) : NaN;
		return Number.isFinite(n) ? n : '';
	}
	function setLastClassId(id: number) {
		localStorage.setItem(LS_KEY, String(id));
	}

	let tagInputEl = $state<HTMLInputElement | undefined>(undefined);

	async function loadClasses() {
		const res = await kcFetch('/api/class');
		if (res.ok) {
			classes = await res.json();
			// Preselect last used class if present in list
			const last = getLastClassId();
			if (last !== '') {
				if (classes.some((c) => c.id === last)) newClassId = last;
				else newClassId = '';
			}
		}
	}

	async function refresh() {
		const res = await kcFetch(apiPath);
		if (res.ok) drivers = await res.json();
	}

	async function createDriver() {
		const name = newName.trim();
		const tag = newTag.trim();
		const class_id = newClassId === '' ? null : Number(newClassId);
		if (!name || !class_id || !tag) return;

		const res = await kcFetch(apiPath, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, class_id, tag })
		});
		if (res.ok) {
			// remember class for next adds
			setLastClassId(class_id);
			newName = '';
			newTag = '';
			await refresh();
		}
		// Keep class as last used; refocus tag for fast bulk adds
		tagInputEl?.focus();
	}

	// Inline edit (PATCH only changes)
	let editingId: number | null = $state(null);
	let editName = $state('');
	let editClassId: number | '' = $state('');
	let editTag = $state('');

	function startEdit(d: Driver) {
		editingId = d.id;
		editName = d.name ?? '';
		editClassId = d.class_id === null || d.class_id === undefined ? '' : d.class_id;
		editTag = d.tag ?? '';
	}
	function cancelEdit() {
		editingId = null;
		editName = '';
		editClassId = '';
		editTag = '';
	}

	async function saveEdit(id: number) {
		const orig = drivers.find((x) => x.id === id);
		if (!orig) return;

		const wantedName = editName.trim();
		const wantedTag = editTag.trim();
		const wantedClassId = editClassId === '' ? null : Number(editClassId);

		const patch: Record<string, unknown> = {};
		if (wantedName && wantedName !== orig.name) patch.name = wantedName;
		if (wantedClassId !== null && wantedClassId !== orig.class_id) patch.class_id = wantedClassId;
		if (wantedTag && wantedTag !== (orig.tag ?? '')) patch.tag = wantedTag;

		if (Object.keys(patch).length === 0) {
			cancelEdit();
			return;
		}

		const res = await kcFetch(`${apiPath}/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (res.ok) {
			cancelEdit();
			await refresh();
		}
	}

	// Deletes
	async function deleteOne(id: number) {
		await kcFetch(`${apiPath}/${id}`, { method: 'DELETE' });
		await refresh();
	}
	async function clearAll() {
		await kcFetch(apiPath, { method: 'DELETE' });
		await refresh();
	}

	// SSE connection for gate tag capture
	let eventSource: EventSource | null = null;
	let lastCapturedTag = $state<string | null>(null);
	let captureFlash = $state(false);

	function startGateCapture() {
		if (eventSource) return;

		eventSource = new EventSource('/api/gate-events/stream');
		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.gate_id && data.tag) {
					if (selectedGateId && data.gate_id === selectedGateId) {
						newTag = data.tag;
						lastCapturedTag = data.tag;
						captureFlash = true;
						setTimeout(() => (captureFlash = false), 500);

						if (autoSubmitEnabled && newName.trim() && newClassId !== '') {
							setTimeout(() => createDriver(), 100);
						}
					}
				}
			} catch {
				// ignore parse errors
			}
		};
		eventSource.onerror = () => {
			eventSource?.close();
			eventSource = null;
			if (gateCaptureEnabled) {
				setTimeout(startGateCapture, 3000);
			}
		};
	}

	function stopGateCapture() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

	$effect(() => {
		loadClasses();
		loadGates();
		refresh();
		const t = setInterval(() => {
			refresh();
			loadGates();
		}, 5000);
		return () => {
			clearInterval(t);
			stopGateCapture();
		};
	});

	$effect(() => {
		if (gateCaptureEnabled && selectedGateId) {
			startGateCapture();
		} else {
			stopGateCapture();
		}
	});
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<p class="small-caps mb-4 text-xl font-semibold tracking-widest text-black dark:text-white">
			Lägg till förare
		</p>

		<div class="grid grid-cols-1 gap-3 md:grid-cols-4">
			<div>
				<label for="newName" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Namn</label
				>
				<Input
					id="newName"
					bind:value={newName}
					placeholder="Förarnamn"
					onkeydown={(e) => e.key === 'Enter' && createDriver()}
				/>
			</div>

			<div>
				<label for="newClass" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Klass</label
				>
				<Select id="newClass" bind:value={newClassId}>
					<option value="" disabled selected>Välj klass…</option>
					{#each classes as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</Select>
			</div>

			<div>
				<label for="newTag" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>RFID-tagg</label
				>
				<Input
					id="newTag"
					bind:elementRef={tagInputEl}
					bind:value={newTag}
					placeholder={gateCaptureEnabled && selectedGateId ? 'Väntar på grind...' : 'Skanna tagg…'}
					class={captureFlash ? 'ring-2 ring-green-500' : ''}
					disabled={!!(gateCaptureEnabled && selectedGateId)}
					onkeydown={(e) => e.key === 'Enter' && createDriver()}
				/>
			</div>

			<div>
				<label for="gateSelect" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Grindfångst</label
				>
				<div class="flex items-center gap-2">
					<Select
						id="gateSelect"
						bind:value={selectedGateId}
						class="flex-1"
						disabled={gateCaptureEnabled}
					>
						<option value={null}>Manuell inmatning</option>
						{#each gates.filter((g) => !g.stage_id) as g (g.id)}
							<option value={g.id}>
								{g.name ?? g.id.slice(0, 8)}
								{isGateOnline(g) ? '🟢' : '⚫'}
							</option>
						{/each}
					</Select>
					<Toggle bind:checked={gateCaptureEnabled} disabled={!selectedGateId} />
				</div>
				{#if selectedGate}
					<div class="mt-1 flex items-center gap-2 text-xs">
						{#if isGateOnline(selectedGate)}
							<Badge color="green" class="text-xs">Online</Badge>
						{:else}
							<Badge color="gray" class="text-xs">Offline</Badge>
						{/if}
						<Toggle bind:checked={autoSubmitEnabled} size="small" />
						<span class="opacity-70">Lägg till automatiskt</span>
					</div>
				{/if}
			</div>
		</div>

		{#if lastCapturedTag && gateCaptureEnabled}
			<div class="mt-2 text-sm text-green-600 dark:text-green-400">
				Senast fångad: <span class="font-mono font-bold">{lastCapturedTag}</span>
			</div>
		{/if}

		<div class="mt-4 flex justify-end gap-3">
			{#if gateCaptureEnabled && selectedGateId}
				<Button
					color="yellow"
					class="w-32"
					onclick={() => {
						gateCaptureEnabled = false;
						newTag = '';
					}}
				>
					Avbryt fångst
				</Button>
			{/if}
			<Button class="w-32" onclick={createDriver}>Lägg till</Button>
		</div>
	</Card>

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-2 flex items-center gap-2">
			<p class="small-caps flex-1 text-xl font-semibold tracking-widest text-black dark:text-white">
				Förare
			</p>
			<Button color="red" class="w-32" onclick={clearAll}>Rensa alla</Button>
		</div>

		<Table hoverable={true}>
			<TableHead>
				<TableHeadCell>Namn</TableHeadCell>
				<TableHeadCell>Klass</TableHeadCell>
				<TableHeadCell>Tagg</TableHeadCell>
				<TableHeadCell class="flex justify-end">Åtgärder</TableHeadCell>
			</TableHead>

			<TableBody>
				{#each drivers as d (d.id)}
					<TableBodyRow>
						<!-- Name -->
						<TableBodyCell>
							{#if editingId === d.id}
								<Input
									aria-label="Förarnamn"
									bind:value={editName}
									onkeydown={(e) => e.key === 'Enter' && saveEdit(d.id)}
								/>
							{:else}
								{d.name}
							{/if}
						</TableBodyCell>

						<!-- Class -->
						<TableBodyCell>
							{#if editingId === d.id}
								<Select aria-label="Förarklass" bind:value={editClassId}>
									<option value="" disabled>Välj klass…</option>
									{#each classes as c (c.id)}
										<option value={c.id}>{c.name}</option>
									{/each}
								</Select>
							{:else}
								{d.class_name ?? d.class_id}
							{/if}
						</TableBodyCell>

						<!-- Tag -->
						<TableBodyCell>
							{#if editingId === d.id}
								<Input
									aria-label="RFID-tagg"
									bind:value={editTag}
									onkeydown={(e) => e.key === 'Enter' && saveEdit(d.id)}
								/>
							{:else}
								{d.tag}
							{/if}
						</TableBodyCell>

						<!-- Actions -->
						<TableBodyCell class="flex justify-end gap-2">
							{#if editingId === d.id}
								<Button size="xs" onclick={() => saveEdit(d.id)}>Spara</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>Avbryt</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(d)}>Redigera</Button>
								<Button size="xs" color="red" onclick={() => deleteOne(d.id)}
									><TrashBinOutline size="xs" /></Button
								>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>
</div>
