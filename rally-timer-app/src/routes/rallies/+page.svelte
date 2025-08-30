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
		Select
	} from 'flowbite-svelte';

	type Rally = { id: number; name: string };
	type Stage = { id: number; rally_id: number; name: string; gate_id: string; blip_id: string };

	// --- state
	let rallies = $state<Rally[]>([]);
	let stages = $state<Stage[]>([]);
	let selectedRallyId = $state<number | null>(null);
	const LS_RALLY = 'rally:lastRallyId';

	// Create rally
	let newRallyName = $state('');

	// Create stage
	let newStageName = $state('');
	let newStageGate = $state('');
	let newStageBlip = $state('');

	// Edit stage
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editGate = $state('');
	let editBlip = $state('');

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
	async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadRallies() {
		rallies = await fetchJSON<Rally[]>('/api/rally');
		// auto-select last used if available
		const last = recallRally();
		if (last !== '' && rallies.some((r) => r.id === last)) {
			selectedRallyId = last;
			await loadStages(last);
		} else if (selectedRallyId !== null && rallies.some((r) => r.id === selectedRallyId)) {
			await loadStages(Number(selectedRallyId));
		} else {
			selectedRallyId = null;
			stages = [];
		}
	}

	async function createRally() {
		const name = newRallyName.trim();
		if (!name) return;
		const r = await fetchJSON<Rally>('/api/rally', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		newRallyName = '';
		await loadRallies();
		selectedRallyId = r.id;
		rememberRally(r.id);
		await loadStages(r.id);
	}

	async function loadStages(rallyId: number) {
		stages = await fetchJSON<Stage[]>(`/api/rally/${rallyId}/stages`);
	}

	async function onSelectRally() {
		if (selectedRallyId === null) {
			stages = [];
			return;
		}
		const id = Number(selectedRallyId);
		rememberRally(id);
		await loadStages(id);
	}

	async function createStage() {
		if (selectedRallyId === null) return;
		const rallyId = Number(selectedRallyId);
		const name = newStageName.trim();
		const gate_id = newStageGate.trim();
		const blip_id = newStageBlip.trim();
		if (!name || !gate_id || !blip_id) return;

		await fetchJSON(`/api/rally/${rallyId}/stages`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, gate_id, blip_id })
		});
		newStageName = newStageGate = newStageBlip = '';
		await loadStages(rallyId);
	}

	function startEdit(s: Stage) {
		editingId = s.id;
		editName = s.name;
		editGate = s.gate_id;
		editBlip = s.blip_id;
	}
	function cancelEdit() {
		editingId = null;
		editName = editGate = editBlip = '';
	}
	async function saveEdit(id: number) {
		const patch: Record<string, unknown> = {};
		if (editName.trim()) patch.name = editName.trim();
		if (editGate.trim()) patch.gate_id = editGate.trim();
		if (editBlip.trim()) patch.blip_id = editBlip.trim();
		if (Object.keys(patch).length === 0) {
			cancelEdit();
			return;
		}

		await fetchJSON(`/api/stage/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		cancelEdit();
		if (selectedRallyId !== null) await loadStages(Number(selectedRallyId));
	}
	async function deleteStage(id: number) {
		await fetch(`/api/stage/${id}`, { method: 'DELETE' });
		if (selectedRallyId !== null) await loadStages(Number(selectedRallyId));
	}

	$effect(() => {
		loadRallies();
		const t = setInterval(() => {
			if (selectedRallyId !== null) loadStages(Number(selectedRallyId));
		}, 5000);
		return () => clearInterval(t);
	});

	async function loadAssigned(rallyId: number) {
		assigned = await fetchJSON<Driver[]>(`/api/rally/${rallyId}/drivers`);
	}
	async function loadAllDrivers() {
		allDrivers = await fetchJSON<Driver[]>(`/api/driver`);
	}
	// update your effect: after selecting rally, call both
	// await loadAllDrivers(); await loadAssigned(id);

	function availableDrivers(): Driver[] {
		const assignedIds = new Set(assigned.map((d) => d.id));
		return allDrivers.filter((d) => !assignedIds.has(d.id));
	}

	async function addToRally(driverId: number) {
		if (selectedRallyId === null) return;
		const id = Number(selectedRallyId);
		await fetchJSON(`/api/rally/${id}/drivers`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ driver_id: driverId })
		});
		await loadAssigned(id);
	}
	async function removeFromRally(driverId: number) {
		if (selectedRallyId === null) return;
		const id = Number(selectedRallyId);
		await fetch(`/api/rally/${id}/drivers/${driverId}`, { method: 'DELETE' });
		await loadAssigned(id);
	}
</script>

<div class="w-full space-y-6 p-5">
	<!-- Rallies -->
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Rallies</h5>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Select Rally -->
			<div>
				<label
					for="rallySelect"
					class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Select rally</label
				>
				<Select id="rallySelect" bind:value={selectedRallyId} onchange={onSelectRally}>
					<option value="">— Choose rally —</option>
					{#each rallies as r}
						<option value={r.id}>{r.name}</option>
					{/each}
				</Select>
			</div>

			<!-- Create Rally -->
			<div>
				<label for="newRally" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Create rally</label
				>
				<div class="flex gap-2">
					<Input
						id="newRally"
						bind:value={newRallyName}
						placeholder="Rally name"
						onkeydown={(e) => e.key === 'Enter' && createRally()}
					/>
					<Button class="w-28" onclick={createRally}>Add</Button>
				</div>
			</div>
		</div>
	</Card>

	<!-- Stages for selected rally -->
	{#if selectedRallyId !== null}
		<script lang="ts">
		</script>

		{#if selectedRallyId !== null}
			<Card class="max-w-none p-4 sm:p-6 md:p-8">
				<h5 class="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
					Assign drivers to rally
				</h5>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Assigned -->
					<div>
						<h6 class="mb-2 text-lg font-semibold">Assigned</h6>
						<ul class="space-y-2">
							{#each assigned as d}
								<li
									class="flex items-center justify-between gap-2 rounded border border-zinc-700 p-2"
								>
									<span>{d.name} — {d.class_name || ''}</span>
									<button
										class="rounded bg-red-600 px-2 py-1"
										on:click={() => removeFromRally(d.id)}>Remove</button
									>
								</li>
							{/each}
							{#if !assigned.length}
								<li class="opacity-70">No drivers assigned.</li>
							{/if}
						</ul>
					</div>

					<!-- Available -->
					<div>
						<h6 class="mb-2 text-lg font-semibold">Available</h6>
						<ul class="space-y-2">
							{#each availableDrivers() as d}
								<li
									class="flex items-center justify-between gap-2 rounded border border-zinc-700 p-2"
								>
									<span>{d.name} — {d.class_name || ''}</span>
									<button class="rounded bg-emerald-600 px-2 py-1" on:click={() => addToRally(d.id)}
										>Add</button
									>
								</li>
							{/each}
							{#if !availableDrivers().length}
								<li class="opacity-70">Everyone is assigned 🎉</li>
							{/if}
						</ul>
					</div>
				</div>
			</Card>
		{/if}

		<Card class="max-w-none p-4 sm:p-6 md:p-8">
			<div class="mb-4">
				<h5 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Stages</h5>
			</div>

			<!-- Add Stage -->
			<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
				<div>
					<label
						for="stageName"
						class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Stage name</label
					>
					<Input
						id="stageName"
						bind:value={newStageName}
						placeholder="SS1"
						onkeydown={(e) => e.key === 'Enter' && createStage()}
					/>
				</div>
				<div>
					<label
						for="stageGate"
						class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Gate ID</label
					>
					<Input
						id="stageGate"
						bind:value={newStageGate}
						placeholder="gate01"
						onkeydown={(e) => e.key === 'Enter' && createStage()}
					/>
				</div>
				<div>
					<label
						for="stageBlip"
						class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Blip ID</label
					>
					<Input
						id="stageBlip"
						bind:value={newStageBlip}
						placeholder="blip01"
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
					<TableHeadCell>Blip</TableHeadCell>
					<TableHeadCell class="flex justify-end">Actions</TableHeadCell>
				</TableHead>

				<TableBody>
					{#each stages as s}
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
								{#if editingId === s.id}
									<Input
										aria-label="Gate ID"
										bind:value={editGate}
										onkeydown={(e) => e.key === 'Enter' && saveEdit(s.id)}
									/>
								{:else}{s.gate_id}{/if}
							</TableBodyCell>
							<TableBodyCell>
								{#if editingId === s.id}
									<Input
										aria-label="Blip ID"
										bind:value={editBlip}
										onkeydown={(e) => e.key === 'Enter' && saveEdit(s.id)}
									/>
								{:else}{s.blip_id}{/if}
							</TableBodyCell>
							<TableBodyCell class="flex justify-end gap-2">
								{#if editingId === s.id}
									<Button size="xs" onclick={() => saveEdit(s.id)}>Save</Button>
									<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
								{:else}
									<a class="inline-block" href={`/rallies/${selectedRallyId}/stages/${s.id}/start`}>
										<Button size="xs">Open Start</Button>
									</a>
									<Button size="xs" onclick={() => startEdit(s)}>Edit</Button>
									<Button size="xs" color="red" onclick={() => deleteStage(s.id)}>Delete</Button>
								{/if}
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</Card>
	{/if}
</div>
