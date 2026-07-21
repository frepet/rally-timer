<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Card, Button, Select, Input, P, Modal, Tabs, TabItem } from 'flowbite-svelte';
	import {
		TrashBinOutline,
		PlusOutline,
		PenOutline,
		StarOutline,
		StarSolid
	} from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';
	import { auth } from '../../lib/stores/auth.svelte';
	import { t } from '../../lib/stores/locale.svelte';
	import { groupStandingsByClass } from '../../lib/domain/standings';

	type Championship = { id: string; name: string; created_at: number; is_default: boolean };
	type StandingRow = {
		driver_uuid: string;
		driver_name: string;
		class_id: number;
		class_name: string;
		total_points: number;
		rally_points: {
			rally_id: string;
			rally_name: string;
			points: number;
			position: number;
			total_ms: number | null;
		}[];
	};
	type SubmittedRally = { id: string; name: string; submitted_at: number };

	let championships = $state<Championship[]>([]);
	let selectedId = $state<string | null>(null);
	let standings = $state<StandingRow[]>([]);
	let rallies = $state<SubmittedRally[]>([]);
	let loading = $state(false);

	// Create championship
	let createModalOpen = $state(false);
	let newChampName = $state('');
	let creating = $state(false);

	async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function kcFetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
		const res = await kcFetch(url, init);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadChampionships() {
		championships = await fetchJSON<Championship[]>('/api/championship');
		if (!selectedId && championships.length) {
			const idParam = page.url.searchParams.get('id');
			const initial =
				championships.find((c) => c.id === idParam) ??
				championships.find((c) => c.is_default) ??
				championships[0];
			await selectChampionship(initial.id);
		}
	}

	async function selectChampionship(id: string) {
		selectedId = id;
		loading = true;
		try {
			const [s, detail] = await Promise.all([
				fetchJSON<StandingRow[]>(`/api/championship/${id}/standings`),
				fetchJSON<{ rallies: SubmittedRally[] }>(`/api/championship/${id}`)
			]);
			standings = s;
			rallies = detail.rallies;
		} finally {
			loading = false;
		}
	}

	async function createChampionship() {
		const name = newChampName.trim();
		if (!name) return;
		creating = true;
		try {
			await kcFetchJSON('/api/championship', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			newChampName = '';
			createModalOpen = false;
			await loadChampionships();
		} catch (e) {
			alert('Error: ' + (e as Error).message);
		} finally {
			creating = false;
		}
	}

	async function removeRallyFromChampionship(rallyId: string, rallyName: string) {
		if (!confirm(t.removeRallyFromChampionshipConfirm(rallyName))) return;
		await kcFetchJSON(`/api/championship/${selectedId}/rally/${rallyId}`, { method: 'DELETE' });
		await selectChampionship(selectedId!);
	}

	async function deleteChampionship(id: string) {
		const c = championships.find((x) => x.id === id);
		if (!confirm(t.deleteChampionshipConfirm(c?.name ?? ''))) return;
		await kcFetchJSON(`/api/championship/${id}`, { method: 'DELETE' });
		if (selectedId === id) {
			selectedId = null;
			standings = [];
			rallies = [];
		}
		await loadChampionships();
	}

	async function toggleDefault() {
		if (!selectedId) return;
		try {
			const res = await kcFetch(`/api/championship/${selectedId}/default`, { method: 'PUT' });
			if (!res.ok) throw new Error(await res.text());
			await loadChampionships();
		} catch (e) {
			alert('Error: ' + (e as Error).message);
		}
	}

	// Rename championship
	let renameModalOpen = $state(false);
	let renameName = $state('');
	let renaming = $state(false);

	function openRenameModal() {
		renameName = selectedChamp?.name ?? '';
		renameModalOpen = true;
	}

	async function renameChampionship() {
		const name = renameName.trim();
		if (!name || !selectedId) return;
		renaming = true;
		try {
			await kcFetchJSON(`/api/championship/${selectedId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			renameModalOpen = false;
			await loadChampionships();
		} catch (e) {
			alert('Error: ' + (e as Error).message);
		} finally {
			renaming = false;
		}
	}

	const standingsByClass = $derived(groupStandingsByClass(standings));
	const classes = $derived(Object.keys(standingsByClass));

	function fmtDate(ms: number): string {
		const dt = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
	}

	const selectedChamp = $derived(championships.find((c) => c.id === selectedId) ?? null);

	onMount(loadChampionships);
</script>

<div class="w-full space-y-6 p-5">
	<div class="flex flex-wrap items-center justify-between gap-2"></div>

	{#if championships.length === 0}
		<Card class="max-w-none p-8 text-center">
			<P class="text-gray-500 dark:text-gray-400">{t.noChampionshipsYet}</P>
			{#if auth.isAdmin}
				<Button class="mt-4" onclick={() => (createModalOpen = true)}
					>{t.createFirstChampionship}</Button
				>
			{/if}
		</Card>
	{:else}
		<!-- Championship selector -->
		<div class="flex items-center gap-2">
			<Select
				class="w-64"
				value={selectedId}
				onchange={(e) => selectChampionship((e.target as HTMLSelectElement).value)}
			>
				{#each championships as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</Select>
			{#if auth.isAdmin && selectedId}
				<button
					class="rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
					title={t.renameChampionshipTitle}
					onclick={openRenameModal}
				>
					<PenOutline size="sm" />
				</button>
				<button
					class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-700 {selectedChamp?.is_default
						? 'text-yellow-400'
						: 'text-gray-500'}"
					title={selectedChamp?.is_default ? t.unstarChampionship : t.starChampionship}
					onclick={toggleDefault}
				>
					{#if selectedChamp?.is_default}
						<StarSolid size="sm" />
					{:else}
						<StarOutline size="sm" />
					{/if}
				</button>
				<button
					class="rounded p-2 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
					title={t.deleteChampionshipTitle}
					onclick={() => deleteChampionship(selectedId!)}
				>
					<TrashBinOutline size="sm" />
				</button>
			{/if}
			{#if auth.isAdmin}
				<Button size="sm" class="whitespace-nowrap" onclick={() => (createModalOpen = true)}>
					<PlusOutline size="sm" class="mr-1" />
					{t.newChampionship}
				</Button>
			{/if}
		</div>

		{#if selectedChamp}
			<div class="space-y-4">
				<!-- Rallies list -->
				{#if rallies.length}
					<div class="flex flex-wrap gap-2">
						{#each rallies as r (r.id)}
							<div class="inline-flex overflow-hidden rounded text-xs font-medium">
								<a
									href="/rallies/{r.id}"
									class="bg-primary-700 px-2.5 py-0.5 text-white hover:brightness-90"
								>
									{r.name} ({fmtDate(r.submitted_at)})
								</a>
								{#if auth.isAdmin}
									<button
										type="button"
										title={t.delete}
										onclick={() => removeRallyFromChampionship(r.id, r.name)}
										class="flex items-center bg-primary-700 px-1.5 text-white hover:bg-red-600"
									>
										<svg
											class="h-3 w-3"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Standings per class -->
				{#if loading}
					<P class="text-gray-400">{t.loadingStandings}</P>
				{:else if standings.length === 0}
					<Card class="max-w-none p-6 text-center">
						<P class="text-gray-500 dark:text-gray-400">{t.noResultsSubmitRally}</P>
						{#if auth.isAdmin}
							<a
								href="/rallies"
								class="mt-2 block text-sm text-blue-600 hover:underline dark:text-blue-400"
							>
								{t.goToManage}
							</a>
						{/if}
					</Card>
				{:else}
					<Tabs style="underline" class="m-0" classes={{ content: 'p-0' }}>
						{#each classes as cls (cls)}
							<TabItem title={cls} open={cls === classes[0]} class="p-0">
								<Card class="max-w-none p-4">
									<table
										class="w-full table-fixed border-collapse text-sm text-gray-500 dark:text-gray-400"
									>
										<colgroup>
											<col class="w-8" />
											<col class="w-40" />
											<col class="w-16" />
											{#each rallies as r (r.id)}
												<col class="w-14" />
												<col class="w-14" />
											{/each}
											<col />
										</colgroup>
										<thead
											class="bg-transparent text-xs text-gray-700 uppercase dark:bg-transparent dark:text-gray-400"
										>
											<tr>
												<th rowspan={2} class="px-2 py-3 text-right align-bottom">#</th>
												<th rowspan={2} class="px-2 py-3 text-left align-bottom"
													>{t.driverHeader}</th
												>
												<th rowspan={2} class="px-2 py-3 text-right align-bottom"
													>{t.pointsHeader}</th
												>
												{#each rallies as r (r.id)}
													<th colspan={2} class="px-2 py-3 text-center text-xs">{r.name}</th>
												{/each}
												<th rowspan={2}></th>
											</tr>
											<tr>
												{#each rallies as r (r.id)}
													<th class="px-1 py-1 text-right text-xs font-normal whitespace-nowrap"
														>{t.pointsHeader}</th
													>
													<th class="px-1 py-1 text-left text-xs font-normal whitespace-nowrap"
														>{t.positionHeader}</th
													>
												{/each}
											</tr>
										</thead>
										<tbody class="font-medium">
											{#each standingsByClass[cls] as row, i (row.driver_uuid)}
												<tr
													class={i % 2 === 0
														? 'bg-gray-50 dark:bg-gray-700/40'
														: 'bg-white dark:bg-gray-800'}
												>
													<td class="px-2 py-4 text-right font-semibold">{i + 1}</td>
													<td class="px-2 py-4">{row.driver_name}</td>
													<td class="px-2 py-4 text-right font-bold">{row.total_points}</td>
													{#each rallies as r (r.id)}
														{@const rp = row.rally_points.find((x) => x.rally_id === r.id)}
														<td class="px-1 py-4 text-right font-mono whitespace-nowrap"
															>{rp ? rp.points : ''}</td
														>
														<td
															class="px-1 py-4 text-left font-mono whitespace-nowrap text-gray-400"
															>{rp ? `P${rp.position}` : ''}</td
														>
													{/each}
													<td></td>
												</tr>
											{/each}
										</tbody>
									</table>
								</Card>
							</TabItem>
						{/each}
					</Tabs>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<!-- Rename Championship Modal -->
<Modal title={t.renameChampionshipTitle} bind:open={renameModalOpen} size="sm" autoclose={false}>
	<div class="flex flex-col gap-4">
		<Input
			bind:value={renameName}
			placeholder={t.championshipName}
			onkeydown={(e) => e.key === 'Enter' && renameChampionship()}
		/>
		<div class="flex justify-end gap-2">
			<Button color="light" onclick={() => (renameModalOpen = false)}>{t.cancel}</Button>
			<Button onclick={renameChampionship} disabled={renaming || !renameName.trim()}>
				{renaming ? t.saving : t.save}
			</Button>
		</div>
	</div>
</Modal>

<!-- Create Championship Modal -->
<Modal title={t.newChampionship} bind:open={createModalOpen} size="sm" autoclose={false}>
	<div class="flex flex-col gap-4">
		<Input
			bind:value={newChampName}
			placeholder={t.championshipName}
			onkeydown={(e) => e.key === 'Enter' && createChampionship()}
		/>
		<div class="flex justify-end gap-2">
			<Button color="light" onclick={() => (createModalOpen = false)}>{t.cancel}</Button>
			<Button onclick={createChampionship} disabled={creating || !newChampName.trim()}>
				{creating ? t.creating : t.create}
			</Button>
		</div>
	</div>
</Modal>
