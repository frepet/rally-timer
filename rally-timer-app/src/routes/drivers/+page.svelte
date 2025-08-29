<script lang="ts">
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
		Select
	} from 'flowbite-svelte';

	type Driver = {
		id: number;
		name: string;
		class_id: number | null;
		tag: string | null;
		class_name?: string;
	};
	type ClassItem = { id: number; name: string };

	let { data }: PageProps = $props();
	let drivers: Driver[] = $state(data.drivers as Driver[]);
	const apiPath = '/api/driver';

	// Create form
	let newName = $state('');
	let newClassId: number | '' = $state('');
	let newTag = $state('');
	let classes: ClassItem[] = $state([]);

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
		const res = await fetch('/api/class');
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
		const res = await fetch(apiPath);
		if (res.ok) drivers = await res.json();
	}

	async function createDriver() {
		const name = newName.trim();
		const tag = newTag.trim();
		const class_id = newClassId === '' ? null : Number(newClassId);
		if (!name || !class_id || !tag) return;

		const res = await fetch(apiPath, {
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
		editClassId = (d.class_id ?? '') as any;
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

		const res = await fetch(`${apiPath}/${id}`, {
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
		await fetch(`${apiPath}/${id}`, { method: 'DELETE' });
		await refresh();
	}
	async function clearAll() {
		await fetch(apiPath, { method: 'DELETE' });
		await refresh();
	}

	$effect(() => {
		loadClasses();
		refresh();
		const t = setInterval(refresh, 5000);
		return () => clearInterval(t);
	});
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Add Driver</h5>

		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div>
				<label for="newName" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Name</label
				>
				<Input
					id="newName"
					bind:value={newName}
					placeholder="Driver name"
					onkeydown={(e) => e.key === 'Enter' && createDriver()}
				/>
			</div>

			<div>
				<label for="newClass" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>Class</label
				>
				<Select id="newClass" bind:value={newClassId}>
					<option value="" disabled selected>Select class…</option>
					{#each classes as c}
						<option value={c.id}>{c.name}</option>
					{/each}
				</Select>
			</div>

			<div>
				<label for="newTag" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
					>RFID Tag</label
				>
				<Input
					id="newTag"
					bind:elementRef={tagInputEl}
					bind:value={newTag}
					placeholder="Scan tag…"
					onkeydown={(e) => e.key === 'Enter' && createDriver()}
				/>
			</div>
		</div>

		<div class="mt-4 flex justify-end">
			<Button class="w-32" onclick={createDriver}>Add</Button>
		</div>
	</Card>

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-2 flex items-center gap-2">
			<h5 class="flex-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Drivers
			</h5>
			<Button color="red" class="w-32" onclick={clearAll}>Clear All</Button>
		</div>

		<Table hoverable={true}>
			<TableHead>
				<TableHeadCell>Name</TableHeadCell>
				<TableHeadCell>Class</TableHeadCell>
				<TableHeadCell>Tag</TableHeadCell>
				<TableHeadCell class="flex justify-end">Actions</TableHeadCell>
			</TableHead>

			<TableBody>
				{#each drivers as d}
					<TableBodyRow>
						<!-- Name -->
						<TableBodyCell>
							{#if editingId === d.id}
								<Input
									aria-label="Driver name"
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
								<Select aria-label="Driver class" bind:value={editClassId}>
									<option value="" disabled>Select class…</option>
									{#each classes as c}
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
									aria-label="RFID tag"
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
								<Button size="xs" onclick={() => saveEdit(d.id)}>Save</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(d)}>Edit</Button>
								<Button size="xs" color="red" onclick={() => deleteOne(d.id)}>Delete</Button>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>
</div>
