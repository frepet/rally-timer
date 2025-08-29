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
		Input
	} from 'flowbite-svelte';
	import { TrashBinSolid } from 'flowbite-svelte-icons';

	type Driver = { id: number; name: string };

	let { data }: PageProps = $props();
	let drivers: Driver[] = $state(data.drivers as Driver[]);
	const apiPath = '/api/driver';

	// CREATE
	let newName = $state('');

	async function createDriver() {
		const name = newName.trim();
		if (!name) return;
		const res = await fetch(apiPath, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (res.ok) {
			newName = '';
			await refresh();
		}
	}

	// READ (list refresh)
	async function refresh() {
		const res = await fetch(apiPath);
		if (res.ok) drivers = await res.json();
	}

	// UPDATE (inline edit)
	let editingId: number | null = $state(null);
	let editName = $state('');

	function startEdit(d: Driver) {
		editingId = d.id;
		editName = d.name;
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
	}

	async function saveEdit(id: number) {
		const name = editName.trim();
		if (!name) return;
		const res = await fetch(`${apiPath}/${id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (res.ok) {
			editingId = null;
			editName = '';
			await refresh();
		}
	}

	// DELETE one
	async function deleteOne(id: number) {
		await fetch(`${apiPath}/${id}`, { method: 'DELETE' });
		await refresh();
	}

	// DELETE all
	async function clearAll() {
		await fetch(apiPath, { method: 'DELETE' });
		await refresh();
	}

	$effect(() => {
		const t = setInterval(refresh, 5000);
		return () => clearInterval(t);
	});
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Add Driver</h5>
		<div class="flex gap-2">
			<Input
				class="flex-1"
				bind:value={newName}
				placeholder="Driver name"
				onkeydown={(e) => e.key === 'Enter' && createDriver()}
			/>
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
				<TableHeadCell class="flex justify-end">Actions</TableHeadCell>
			</TableHead>

			<TableBody>
				{#each drivers as d}
					<TableBodyRow>
						<TableBodyCell>
							{#if editingId === d.id}
								<Input
									class="w-full"
									bind:value={editName}
									onkeydown={(e) => e.key === 'Enter' && saveEdit(d.id)}
								/>
							{:else}
								{d.name}
							{/if}
						</TableBodyCell>

						<TableBodyCell class="flex justify-end gap-2">
							{#if editingId === d.id}
								<Button size="xs" onclick={() => saveEdit(d.id)}>Save</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>Cancel</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(d)}>Edit</Button>
								<Button size="xs" color="red" onclick={() => deleteOne(d.id)}>
									<TrashBinSolid />
								</Button>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>
</div>
