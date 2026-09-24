<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
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
	import { classChipClass } from '../../lib/classColor';
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

<div class="page">
	{#if error}
		<section class="alert-error p-4">
			<P class="text-red-700 dark:text-red-300">{error}</P>
		</section>
	{/if}

	<section class="panel panel-body">
		<p class="panel-title mb-4">
			{t.addClass}
		</p>
		<div class="flex flex-wrap items-end gap-3">
			<div class="min-w-48 flex-1">
				<Input
					bind:value={newName}
					placeholder={t.className}
					aria-label={t.className}
					onkeydown={(e) => e.key === 'Enter' && createClass()}
				/>
			</div>
			<div class="w-28">
				<Input
					bind:value={newPriority}
					type="number"
					placeholder={t.priority}
					aria-label={t.priority}
					title={t.startPriorityTitle}
				/>
			</div>
			<Button class="w-32" onclick={createClass} disabled={creating || !newName.trim()}>
				{creating ? t.adding : t.add}
			</Button>
		</div>
	</section>

	<section class="panel panel-body">
		<p class="panel-title mb-2">
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
								<span class="chip text-xs {classChipClass(c.name)}">{c.name}</span>
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
								<Button size="xs" color="alternative" onclick={() => startEdit(c)}>{t.edit}</Button>
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
			<P class="mt-4 text-surface-500 dark:text-surface-400">{t.noResultsYet}</P>
		{/if}
	</section>
</div>
