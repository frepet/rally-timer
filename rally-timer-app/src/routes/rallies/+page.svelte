<script lang="ts">
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
		Badge,
		P,
		Modal
	} from 'flowbite-svelte';
	import { TrashBinOutline, DotsVerticalOutline, PlayOutline, EditOutline, PlusOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';

	type Rally = { id: number; name: string };
	type Stage = { id: number; rally_id: number; name: string };
	type Gate = { id: string; name: string | null; last_seen: number; stage_id: number | null };

	// --- state
	let rallies = $state<Rally[]>([]);
	let stages = $state<Stage[]>([]);
	let gates = $state<Gate[]>([]);
	let stageGateSelect = $state<Record<number, string>>({});
	let selectedRallyId = $state<number | null>(null);
	const LS_RALLY = 'rally:lastRallyId';

	// Create rally
	let newRallyName = $state('');

	// Edit rally
	let editingRallyId = $state<number | null>(null);
	let editRallyName = $state('');

	// Create stage
	let newStageName = $state('');

	// Edit stage
	let editingId = $state<number | null>(null);
	let editName = $state('');

	// Stage row menu
	let openStageMenuId = $state<number | null>(null);
	let stageMenuPos = $state({ top: 'auto', bottom: 'auto', right: '0px' });
	const menuStage = $derived(stages.find((s) => s.id === openStageMenuId) ?? null);

	function openStageMenu(e: MouseEvent, id: number) {
		e.stopPropagation();
		if (openStageMenuId === id) {
			openStageMenuId = null;
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const menuHeight = 140; // approx: 4 items × ~32px + padding
		const flip = rect.bottom + menuHeight > window.innerHeight;
		stageMenuPos = {
			top: flip ? 'auto' : `${rect.bottom}px`,
			bottom: flip ? `${window.innerHeight - rect.top}px` : 'auto',
			right: `${window.innerWidth - rect.right}px`
		};
		openStageMenuId = id;
	}

	const stageMenuItemClass =
		'block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600';

	type Driver = {
		id: number;
		name: string;
		tag: string;
		class_id?: number;
		class_name?: string;
	};

	let allDrivers = $state<Driver[]>([]);
	let assigned = $state<Driver[]>([]);

	function rememberRally(id: number) {
		localStorage.setItem(LS_RALLY, String(id));
	}
	function recallRally(): number | '' {
		const raw = localStorage.getItem(LS_RALLY);
		const n = raw ? Number(raw) : NaN;
		return Number.isFinite(n) ? n : '';
	}

	// --- API helpers
	async function kcFetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await kcFetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadRallies() {
		rallies = await fetchJSON<Rally[]>('/api/rally');
		const last = recallRally();

		if (last !== '' && rallies.some((r) => r.id === last)) {
			selectedRallyId = last;
			await Promise.all([loadStages(last), loadAssigned(last)]);
		} else if (selectedRallyId !== null && rallies.some((r) => r.id === selectedRallyId)) {
			const id = Number(selectedRallyId);
			await Promise.all([loadStages(id), loadAssigned(id)]);
		} else if (rallies.length) {
			const id = rallies[0].id;
			selectedRallyId = id;
			rememberRally(id);
			await Promise.all([loadStages(id), loadAssigned(id), loadAllDrivers(), loadGates()]);
		} else {
			selectedRallyId = null;
			stages = [];
			assigned = [];
		}
	}

	async function createRally() {
		const name = newRallyName.trim();
		if (!name) return;
		const r = await kcFetchJSON<Rally>('/api/rally', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		newRallyName = '';
		newRallyModalOpen = false;
		await loadRallies();
		selectedRallyId = r.id;
		rememberRally(r.id);
		await loadStages(r.id);
	}

	function startEditRally(r: Rally) {
		editingRallyId = r.id;
		editRallyName = r.name;
	}
	function cancelEditRally() {
		editingRallyId = null;
		editRallyName = '';
	}
	async function saveEditRally(id: number) {
		const name = editRallyName.trim();
		if (!name) {
			cancelEditRally();
			return;
		}

		await kcFetchJSON(`/api/rally/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		cancelEditRally();
		await loadRallies();
	}
	async function deleteRally(id: number) {
		const rallyName = rallies.find((r) => r.id === id)?.name ?? 'this rally';
		if (!confirm(`Are you sure you want to delete "${rallyName}"? This cannot be undone.`)) return;

		try {
			selectedRallyId = null;
			await kcFetch(`/api/rally/${id}`, { method: 'DELETE' });
			await loadRallies();
		} catch (e) {
			alert('Cannot delete rally: ' + (e as Error).message);
		}
	}

	async function loadStages(rallyId: number) {
		stages = await fetchJSON<Stage[]>(`/api/rally/${rallyId}/stages`);
	}

	async function onSelectRallyForEdit(id: number) {
		selectedRallyId = id;
		rememberRally(id);
		await Promise.all([loadAllDrivers(), loadAssigned(id), loadStages(id), loadGates()]);
	}

	async function createStage() {
		if (selectedRallyId === null) return;
		const rallyId = Number(selectedRallyId);
		const name = newStageName.trim();
		if (!name) return;

		await kcFetchJSON(`/api/rally/${rallyId}/stages`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		newStageName = '';
		await loadStages(rallyId);
	}

	function startEdit(s: Stage) {
		editingId = s.id;
		editName = s.name;
	}
	function cancelEdit() {
		editingId = null;
		editName = '';
	}
	async function saveEdit(id: number) {
		const patch: Record<string, unknown> = {};
		if (editName.trim()) patch.name = editName.trim();
		if (Object.keys(patch).length === 0) {
			cancelEdit();
			return;
		}

		await kcFetchJSON(`/api/stage/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		cancelEdit();
		if (selectedRallyId !== null) await loadStages(Number(selectedRallyId));
	}
	async function deleteStage(id: number) {
		await kcFetch(`/api/stage/${id}`, { method: 'DELETE' });
		if (selectedRallyId !== null) await loadStages(Number(selectedRallyId));
	}

	$effect(() => {
		loadRallies();
		loadAllDrivers();
		loadGates();
		const t = setInterval(async () => {
			if (selectedRallyId !== null) {
				const id = Number(selectedRallyId);
				await Promise.all([loadStages(id), loadAssigned(id), loadGates()]);
			}
		}, 5000);
		return () => clearInterval(t);
	});

	async function loadAssigned(rallyId: number) {
		assigned = await fetchJSON<Driver[]>(`/api/rally/${rallyId}/drivers`);
	}
	async function loadAllDrivers() {
		allDrivers = await fetchJSON<Driver[]>(`/api/driver`);
	}

	async function loadGates() {
		gates = await kcFetchJSON<Gate[]>('/api/gate');
	}

	function isOnline(gate: Gate): boolean {
		return Date.now() - gate.last_seen < 30000;
	}

	function assignedGatesForStage(stageId: number): Gate[] {
		return gates.filter((g) => g.stage_id === stageId);
	}

	function availableGatesForAssign(): Gate[] {
		return gates.filter((g) => !g.stage_id);
	}

	async function assignGateToStage(stageId: number) {
		const gateId = stageGateSelect[stageId] ?? availableGatesForAssign()[0]?.id;
		if (!gateId) return;
		await kcFetchJSON(`/api/gate/${gateId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: stageId })
		});
		stageGateSelect = { ...stageGateSelect, [stageId]: '' };
		await loadGates();
	}

	async function unassignGate(gate: Gate) {
		if (!confirm(`Unassign gate "${gate.name ?? gate.id}" from this stage?`)) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: null })
		});
		await loadGates();
	}

	let assignModalOpen = $state(false);
	let newRallyModalOpen = $state(false);
	let driverSearch = $state('');

	function availableDrivers(): Driver[] {
		const assignedIds = new Set(assigned.map((d) => d.id));
		return allDrivers.filter((d) => !assignedIds.has(d.id));
	}

	const filteredAvailableDrivers = $derived.by(() => {
		const q = driverSearch.trim().toLowerCase();
		return availableDrivers().filter(
			(d) => !q || d.name.toLowerCase().includes(q) || (d.class_name ?? '').toLowerCase().includes(q)
		);
	});

	async function addToRally(driverId: number) {
		if (selectedRallyId === null) return;
		const id = Number(selectedRallyId);
		await kcFetchJSON(`/api/rally/${id}/drivers`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ driver_id: driverId })
		});
		await loadAssigned(id);
	}
	async function removeFromRally(driverId: number) {
		if (selectedRallyId === null) return;
		const id = Number(selectedRallyId);
		await kcFetch(`/api/rally/${id}/drivers/${driverId}`, { method: 'DELETE' });
		await loadAssigned(id);
	}
</script>

<svelte:window onclick={() => (openStageMenuId = null)} />

<!-- Stage row dropdown portal -->
{#if menuStage}
	<div
		role="menu"
		style="position:fixed; top:{stageMenuPos.top}; bottom:{stageMenuPos.bottom}; right:{stageMenuPos.right}; z-index:9999;"
		class="min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && (openStageMenuId = null)}
	>
		<a href={`/rallies/${selectedRallyId}/stages/${menuStage.id}/events`} class={stageMenuItemClass}
			>Events</a
		>
		<button
			type="button"
			class={stageMenuItemClass}
			onclick={() => {
				const s = menuStage!;
				openStageMenuId = null;
				startEdit(s);
			}}>Rename</button
		>
		<button
			type="button"
			class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-600"
			onclick={() => {
				const id = menuStage!.id;
				openStageMenuId = null;
				deleteStage(id);
			}}
		>
			<TrashBinOutline size="xs" /> Delete
		</button>
	</div>
{/if}

<div class="w-full space-y-6 p-5">
	<!-- Rallies -->
	<Card class="max-w-none p-4">
		<div class="mb-4">
			<P class="text-2xl font-bold">Rallies</P>
		</div>

		<!-- Row 1: dropdown + icons -->
		{#if editingRallyId !== null}
			<div class="mb-3 flex items-center gap-2">
				<Input
					aria-label="Rally name"
					bind:value={editRallyName}
					class="flex-1"
					onkeydown={(e) => e.key === 'Enter' && saveEditRally(editingRallyId!)}
				/>
				<Button size="sm" onclick={() => saveEditRally(editingRallyId!)}>Save</Button>
				<Button size="sm" color="light" onclick={cancelEditRally}>Cancel</Button>
			</div>
		{:else}
			<div class="mb-3 flex items-center gap-2">
				{#if rallies.length}
				<Select
					class="flex-1"
					value={selectedRallyId ?? ''}
					onchange={(e) => {
						const id = Number((e.currentTarget as HTMLSelectElement).value);
						if (id) onSelectRallyForEdit(id);
					}}
				>
					{#each rallies as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</Select>
				{:else}
					<span class="flex-1 text-sm text-gray-500 dark:text-gray-400">Create a new rally to get started</span>
				{/if}
				<button
					class="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
					title="New rally"
					onclick={() => (newRallyModalOpen = true)}
				><PlusOutline size="sm" class="text-gray-500 dark:text-gray-400" /></button>
				{#if selectedRallyId !== null}
					{@const sel = rallies.find((r) => r.id === selectedRallyId)}
					{#if sel}
						<button
							class="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Rename rally"
							onclick={() => startEditRally(sel)}
						><EditOutline size="sm" class="text-gray-500 dark:text-gray-400" /></button>
						<button
							class="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Delete rally"
							onclick={() => deleteRally(sel.id)}
						><TrashBinOutline size="sm" class="text-red-500 dark:text-red-400" /></button>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Row 2: Assign Drivers (only when rally selected) -->
		{#if selectedRallyId !== null && editingRallyId === null}
			<Button size="sm" onclick={() => (assignModalOpen = true)}>Assign Drivers</Button>
		{/if}
	</Card>

	{#if selectedRallyId !== null}
		<Card class="max-w-none p-4">
			<div class="mb-4">
				<P class="text-2xl font-bold">Stages</P>
			</div>

			<!-- Add Stage -->
			<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
				<div>
					<P><label for="stageName" class="mb-2 block text-sm font-medium">Stage name</label></P>
					<Input
						id="stageName"
						bind:value={newStageName}
						placeholder="SS1"
						onkeydown={(e) => e.key === 'Enter' && createStage()}
					/>
				</div>
				<div class="flex items-end">
					<Button class="w-full md:w-32" onclick={createStage}>Add Stage</Button>
				</div>
			</div>

			<!-- Stages Table -->
			<Table hoverable={true}>
				<TableHead>
					<TableHeadCell>Name</TableHeadCell>
					<TableHeadCell>Gate</TableHeadCell>
					<TableHeadCell class="text-center">Start</TableHeadCell>
					<TableHeadCell class="text-right">Actions</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each stages as s (s.id)}
						<TableBodyRow>
							<TableBodyCell>
								{#if editingId === s.id}
									<Input
										aria-label="Stage name"
										bind:value={editName}
										onkeydown={(e) => e.key === 'Enter' && saveEdit(s.id)}
									/>
								{:else}{s.name}{/if}
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex flex-wrap items-center gap-2">
									{#each assignedGatesForStage(s.id) as g (g.id)}
										<span
											class="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-sm dark:bg-blue-900"
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
												title="Unassign gate">×</button
											>
										</span>
									{/each}
									{#if availableGatesForAssign().length}
										<div class="flex items-center gap-1">
											<Select
												placeholder=""
												size="sm"
												class="w-36"
												value={stageGateSelect[s.id] || availableGatesForAssign()[0]?.id || ''}
												onchange={(e) => {
													stageGateSelect = {
														...stageGateSelect,
														[s.id]: (e.currentTarget as HTMLSelectElement).value
													};
												}}
											>
												{#each availableGatesForAssign() as g (g.id)}
													<option value={g.id}>{g.name ?? g.id.slice(0, 8)}</option>
												{/each}
											</Select>
											<Button size="xs" onclick={() => assignGateToStage(s.id)}>Assign</Button>
										</div>
									{:else if !assignedGatesForStage(s.id).length}
										<span class="text-sm text-gray-400 dark:text-gray-500">No unassigned gates</span>
									{/if}
								</div>
							</TableBodyCell>
							<TableBodyCell class="text-center">
								{#if assignedGatesForStage(s.id).length > 0}
									<a
										href={`/rallies/${selectedRallyId}/stages/${s.id}/start`}
										class="inline-flex items-center justify-center rounded p-1 text-green-600 hover:bg-gray-100 dark:text-green-400 dark:hover:bg-gray-700"
										title="Open Start"
									>
										<PlayOutline size="md" />
									</a>
								{:else}
									<span class="text-xs text-gray-400 dark:text-gray-500">Select gate first</span>
								{/if}
							</TableBodyCell>
							<TableBodyCell class="text-right">
								{#if editingId === s.id}
									<div class="flex justify-end gap-2">
										<Button size="xs" onclick={() => saveEdit(s.id)}>Save</Button>
										<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
									</div>
								{:else}
									<button
										type="button"
										onclick={(e) => openStageMenu(e, s.id)}
										class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
									>
										<DotsVerticalOutline class="text-gray-500 dark:text-gray-400" size="sm" />
									</button>
								{/if}
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</Card>
	{/if}
</div>

<Modal title="Assign Drivers" bind:open={assignModalOpen} size="lg" autoclose={false}>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div>
			<P class="mb-2 text-lg font-semibold">Assigned</P>
			<ul class="max-h-80 space-y-2 overflow-y-auto">
				{#each assigned as d (d.id)}
					<li class="flex items-center justify-between gap-2 rounded border p-2">
						<span>{d.name}{d.class_name ? ` — ${d.class_name}` : ''}</span>
						<Button size="xs" color="red" onclick={() => removeFromRally(d.id)}>Remove</Button>
					</li>
				{/each}
				{#if !assigned.length}
					<li class="opacity-70">No drivers assigned.</li>
				{/if}
			</ul>
		</div>

		<div>
			<div class="mb-2 flex items-center gap-2">
				<P class="text-lg font-semibold">Available</P>
				<Input size="sm" placeholder="Search..." bind:value={driverSearch} class="flex-1" />
			</div>
			<ul class="max-h-80 space-y-2 overflow-y-auto">
				{#each filteredAvailableDrivers as d (d.id)}
					<li class="flex items-center justify-between gap-2 rounded border p-2">
						<span>{d.name}{d.class_name ? ` — ${d.class_name}` : ''}</span>
						<Button size="xs" color="green" onclick={() => addToRally(d.id)}>Add</Button>
					</li>
				{/each}
				{#if !filteredAvailableDrivers.length}
					<li class="opacity-70">{driverSearch ? 'No matches.' : 'Everyone is assigned.'}</li>
				{/if}
			</ul>
		</div>
	</div>
	<div class="mt-4 border-t pt-3">
		<a href="/drivers" class="text-sm text-blue-600 hover:underline dark:text-blue-400"
			>Manage / add drivers →</a
		>
	</div>
</Modal>

<Modal title="New Rally" bind:open={newRallyModalOpen} size="sm" autoclose={false}>
	<div class="flex flex-col gap-4">
		<Input
			bind:value={newRallyName}
			placeholder="Rally name"
			onkeydown={(e) => e.key === 'Enter' && createRally()}
		/>
		<div class="flex justify-end gap-2">
			<Button color="light" onclick={() => (newRallyModalOpen = false)}>Cancel</Button>
			<Button onclick={createRally} disabled={!newRallyName.trim()}>Create</Button>
		</div>
	</div>
</Modal>
