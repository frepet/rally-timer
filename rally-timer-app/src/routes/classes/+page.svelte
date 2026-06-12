<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
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
		P
	} from 'flowbite-svelte';
	import { TrashBinOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';
	import { t } from '../../lib/stores/locale.svelte';

	type ClassItem = { id: number; name: string; start_priority: number; driver_count: number };

	let classes: ClassItem[] = $state([]);
	let newName = $state('');
	let newPriority = $state(0);
	let creating = $state(false);
	let error: string | null = $state(null);

	async function refresh() {
		const res = await kcFetch('/api/class');
		if (!res.ok) return;
		const list = (await res.json()) as { id: number; name: string; start_priority: number }[];

		// Fetch drivers once to compute per-class counts (drivers list is small)
		const dRes = await kcFetch('/api/driver');
		const drivers = dRes.ok ? ((await dRes.json()) as { class_id: number }[]) : [];
		const counts = new SvelteMap<number, number>();
		for (const d of drivers) counts.set(d.class_id, (counts.get(d.class_id) ?? 0) + 1);

		classes = list
			.map((c) => ({ ...c, driver_count: counts.get(c.id) ?? 0 }))
			.sort((a, b) => b.start_priority - a.start_priority || a.name.localeCompare(b.name));
	}

	async function createClass() {
		const name = newName.trim();
		if (!name) return;
		creating = true;
		error = null;
		try {
			const res = await kcFetch('/api/class', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, start_priority: newPriority })
			});
			if (!res.ok) {
				error = (await res.text()) || `Failed (${res.status})`;
				return;
			}
			newName = '';
			newPriority = 0;
			await refresh();
		} finally {
			creating = false;
		}
	}

	let editingId: number | null = $state(null);
	let editName = $state('');
	let editPriority = $state(0);

	function startEdit(c: ClassItem) {
		editingId = c.id;
		editName = c.name;
		editPriority = c.start_priority;
		error = null;
	}
	function cancelEdit() {
		editingId = null;
		editName = '';
		editPriority = 0;
	}

	async function saveEdit(id: number) {
		const name = editName.trim();
		const orig = classes.find((c) => c.id === id);
		if (!orig || !name) {
			cancelEdit();
			return;
		}
		if (name === orig.name && editPriority === orig.start_priority) {
			cancelEdit();
			return;
		}
		const res = await kcFetch(`/api/class/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, start_priority: editPriority })
		});
		if (!res.ok) {
			error = (await res.text()) || `Failed (${res.status})`;
			return;
		}
		cancelEdit();
		await refresh();
	}

	async function deleteClass(c: ClassItem) {
		const driverWarning = c.driver_count > 0 ? t.deleteClassDriverWarning(c.driver_count) : '';
		const msg = t.deleteClassConfirm(c.name, driverWarning);
		if (!confirm(msg)) return;

		const res = await kcFetch(`/api/class/${c.id}`, { method: 'DELETE' });
		if (!res.ok) {
			error = (await res.text()) || t.failedStatus(res.status);
			return;
		}
		await refresh();
	}

	onMount(refresh);
</script>

<div class="w-full space-y-6 p-5">
	{#if error}
		<Card class="max-w-none border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
			<P class="text-red-700 dark:text-red-300">{error}</P>
		</Card>
	{/if}

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<p class="small-caps mb-4 text-xl font-semibold tracking-widest text-black dark:text-white">
			{t.addClass}
		</p>
		<div class="flex gap-3">
			<Input
				bind:value={newName}
				placeholder={t.className}
				class="flex-1"
				onkeydown={(e) => e.key === 'Enter' && createClass()}
			/>
			<Input
				bind:value={newPriority}
				type="number"
				placeholder={t.priority}
				class="w-28"
				title={t.startPriorityTitle}
			/>
			<Button class="w-32" onclick={createClass} disabled={creating || !newName.trim()}>
				{creating ? t.adding : t.add}
			</Button>
		</div>
	</Card>

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<p class="small-caps mb-2 text-xl font-semibold tracking-widest text-black dark:text-white">
			{t.classesHeading}
		</p>

		<Table hoverable={true}>
			<TableHead>
				<TableHeadCell>{t.name}</TableHeadCell>
				<TableHeadCell class="w-32 text-right" title={t.startPriorityHigherNote}
					>{t.priority}</TableHeadCell
				>
				<TableHeadCell class="text-right">{t.driversHeading}</TableHeadCell>
				<TableHeadCell class="flex justify-end">{t.actions}</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each classes as c (c.id)}
					<TableBodyRow>
						<TableBodyCell>
							{#if editingId === c.id}
								<Input
									aria-label={t.className}
									bind:value={editName}
									onkeydown={(e) => {
										if (e.key === 'Enter') saveEdit(c.id);
										if (e.key === 'Escape') cancelEdit();
									}}
								/>
							{:else}
								{c.name}
							{/if}
						</TableBodyCell>
						<TableBodyCell class="text-right">
							{#if editingId === c.id}
								<Input
									aria-label={t.startPriorityAriaLabel}
									type="number"
									bind:value={editPriority}
									class="w-24 text-right"
									onkeydown={(e) => {
										if (e.key === 'Enter') saveEdit(c.id);
										if (e.key === 'Escape') cancelEdit();
									}}
								/>
							{:else}
								{c.start_priority}
							{/if}
						</TableBodyCell>
						<TableBodyCell class="text-right">{c.driver_count}</TableBodyCell>
						<TableBodyCell class="flex justify-end gap-2">
							{#if editingId === c.id}
								<Button size="xs" onclick={() => saveEdit(c.id)}>{t.save}</Button>
								<Button size="xs" color="light" onclick={cancelEdit}>{t.cancel}</Button>
							{:else}
								<Button size="xs" onclick={() => startEdit(c)}>{t.edit}</Button>
								<Button size="xs" color="red" onclick={() => deleteClass(c)}>
									<TrashBinOutline size="xs" />
								</Button>
							{/if}
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>

		{#if classes.length === 0}
			<P class="mt-4 text-gray-500 dark:text-gray-400">{t.noResultsYet}</P>
		{/if}
	</Card>
</div>
