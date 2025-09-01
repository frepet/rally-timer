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
		P
	} from 'flowbite-svelte';

	type Rally = { id: number; name: string };
	type Stage = { id: number; rally_id: number; name: string };

	// --- state
	let rallies = $state<Rally[]>([]);
	let stages = $state<Stage[]>([]);
	let selectedRallyId = $state<number | null>(null);
	const LS_RALLY = 'rally:lastRallyId';

	// Create rally
	let newRallyName = $state('');

	// Create stage
	let newStageName = $state('');

	// Edit stage
	let editingId = $state<number | null>(null);
	let editName = $state('');

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
		const last = recallRally();

		if (last !== '' && rallies.some((r) => r.id === last)) {
			selectedRallyId = last;
			await Promise.all([loadStages(last), loadAssigned(last)]);
		} else if (selectedRallyId !== null && rallies.some((r) => r.id === selectedRallyId)) {
			const id = Number(selectedRallyId);
			await Promise.all([loadStages(id), loadAssigned(id)]);
		} else {
			selectedRallyId = null;
			stages = [];
			assigned = [];
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
			assigned = [];
			return;
		}
		const id = Number(selectedRallyId);
		rememberRally(id);
		await Promise.all([loadAllDrivers(), loadAssigned(id), loadStages(id)]);
	}

	async function createStage() {
		if (selectedRallyId === null) return;
		const rallyId = Number(selectedRallyId);
		const name = newStageName.trim();
		if (!name) return;

		await fetchJSON(`/api/rally/${rallyId}/stages`, {
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
		loadAllDrivers();
		const t = setInterval(async () => {
			if (selectedRallyId !== null) {
				const id = Number(selectedRallyId);
				await Promise.all([loadStages(id), loadAssigned(id)]);
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
		<P class="mb-4 text-2xl font-bold tracking-tight">Rallies</P>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Select Rally -->
			<div>
				<label for="rallySelect" class="mb-2 block text-sm font-medium"><P>Select rally</P></label>
				<Select id="rallySelect" bind:value={selectedRallyId} onchange={onSelectRally}>
					<option value="">— Choose rally —</option>
					{#each rallies as r}
						<option value={r.id}>{r.name}</option>
					{/each}
				</Select>
			</div>

			<!-- Create Rally -->
			<div>
				<label for="newRally" class="mb-2 block text-sm font-medium"><P>New Rally</P></label>
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

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<a href={`/rallies/${selectedRallyId}/leaderboard`}>
			<Button size="xs">View Leaderboard</Button>
		</a>
	</Card>

	{#if selectedRallyId !== null}
		<Card class="max-w-none p-4 sm:p-6 md:p-8">
			<P class="mb-4 text-2xl font-bold">Assign drivers to rally</P>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div>
					<P class="mb-2 text-lg font-semibold">Assigned</P>
					<ul class="space-y-2">
						{#each assigned as d}
							<li class="flex items-center justify-between gap-2 rounded border p-2">
								<P><span>{d.name} — {d.class_name || ''}</span></P>
								<Button class="rounded bg-red-600 px-2 py-1" onclick={() => removeFromRally(d.id)}
									>Remove</Button
								>
							</li>
						{/each}
						{#if !assigned.length}
							<li class="opacity-70"><P>No drivers assigned.</P></li>
						{/if}
					</ul>
				</div>

				<div>
					<P class="mb-2 text-lg font-semibold">Available</P>
					<ul class="space-y-2">
						{#each availableDrivers() as d}
							<li class="flex items-center justify-between gap-2 rounded border p-2">
								<P><span>{d.name} — {d.class_name || ''}</span></P>
								<Button class="rounded px-2 py-1" color="green" onclick={() => addToRally(d.id)}
									>Add</Button
								>
							</li>
						{/each}
						{#if !availableDrivers().length}
							<li class="opacity-70"><P>Everyone is assigned 🎉</P></li>
						{/if}
					</ul>
				</div>
			</div>
		</Card>

		<Card class="max-w-none p-4 sm:p-6 md:p-8">
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
							<TableBodyCell class="flex justify-end gap-2">
								{#if editingId === s.id}
									<Button size="xs" onclick={() => saveEdit(s.id)}>Save</Button>
									<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
								{:else}
									<a href={`/rallies/${selectedRallyId}/stages/${s.id}/events`}>
										<Button size="xs">Events</Button>
									</a>
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
