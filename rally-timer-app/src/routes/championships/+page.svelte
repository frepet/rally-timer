<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		Card,
		Button,
		Select,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Input,
		Badge,
		P,
		Modal,
		Tabs,
		TabItem
	} from 'flowbite-svelte';
	import { TrashBinOutline, PlusOutline, PenOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';

	type Championship = { id: string; name: string; created_at: number };
	type StandingRow = {
		driver_uuid: string;
		driver_name: string;
		class_id: number;
		class_name: string;
		total_points: number;
		rally_points: { rally_id: string; rally_name: string; points: number; position: number }[];
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
			const initial = championships.find((c) => c.id === idParam) ?? championships[0];
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

	async function deleteChampionship(id: string) {
		const c = championships.find((x) => x.id === id);
		if (!confirm(`Delete championship "${c?.name}"? This cannot be undone.`)) return;
		await kcFetchJSON(`/api/championship/${id}`, { method: 'DELETE' });
		if (selectedId === id) {
			selectedId = null;
			standings = [];
			rallies = [];
		}
		await loadChampionships();
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

	// Group standings by class
	const classes = $derived([...new Set(standings.map((s) => s.class_name))].sort());
	const standingsByClass = $derived(
		Object.fromEntries(classes.map((cls) => [cls, standings.filter((s) => s.class_name === cls)]))
	);

	function fmtDate(ms: number): string {
		const dt = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
	}

	const selectedChamp = $derived(championships.find((c) => c.id === selectedId) ?? null);

	onMount(loadChampionships);
</script>

<div class="w-full space-y-6 p-5">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<P class="text-3xl font-bold">Championships</P>
		{#if $isAdmin}
			<Button size="sm" class="whitespace-nowrap" onclick={() => (createModalOpen = true)}>
				<PlusOutline size="sm" class="mr-1" /> New Championship
			</Button>
		{/if}
	</div>

	{#if championships.length === 0}
		<Card class="max-w-none p-8 text-center">
			<P class="text-gray-500 dark:text-gray-400">No championships yet.</P>
			{#if $isAdmin}
				<Button class="mt-4" onclick={() => (createModalOpen = true)}
					>Create your first championship</Button
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
			{#if $isAdmin && selectedId}
				<button
					class="rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Rename championship"
					onclick={openRenameModal}
				>
					<PenOutline size="sm" />
				</button>
				<button
					class="rounded p-2 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Delete championship"
					onclick={() => deleteChampionship(selectedId!)}
				>
					<TrashBinOutline size="sm" />
				</button>
			{/if}
		</div>

		{#if selectedChamp}
			<div class="space-y-4">
				<!-- Rallies list -->
				{#if rallies.length}
					<div class="flex flex-wrap gap-2">
						{#each rallies as r (r.id)}
							<a href="/rallies/{r.id}">
								<Badge color="blue" class="cursor-pointer hover:brightness-90"
									>{r.name} ({fmtDate(r.submitted_at)})</Badge
								>
							</a>
						{/each}
					</div>
				{/if}

				<!-- Standings per class -->
				{#if loading}
					<P class="text-gray-400">Loading standings…</P>
				{:else if standings.length === 0}
					<Card class="max-w-none p-6 text-center">
						<P class="text-gray-500 dark:text-gray-400"
							>No results yet. Submit a rally to see standings.</P
						>
						{#if $isAdmin}
							<a
								href="/rallies"
								class="mt-2 block text-sm text-blue-600 hover:underline dark:text-blue-400"
							>
								Go to Manage →
							</a>
						{/if}
					</Card>
				{:else}
					<Tabs style="underline" class="m-0" classes={{ content: 'p-0' }}>
						{#each classes as cls (cls)}
							<TabItem title={cls} open={cls === classes[0]} class="p-0">
								<Card class="max-w-none p-4">
									<Table class="[&_tr]:border-0">
										<TableHead class="bg-transparent dark:bg-transparent">
											<TableHeadCell class="w-8 px-2 text-right">#</TableHeadCell>
											<TableHeadCell>Driver</TableHeadCell>
											<TableHeadCell class="text-right">Points</TableHeadCell>
											{#each rallies as r (r.id)}
												<TableHeadCell class="text-right text-xs">{r.name}</TableHeadCell>
											{/each}
										</TableHead>
										<TableBody>
											{#each standingsByClass[cls] as row, i (row.driver_uuid)}
												<TableBodyRow
													class="border-0 {i % 2 === 0
														? 'bg-gray-50 dark:bg-gray-700/40'
														: 'bg-white dark:bg-gray-800'}"
												>
													<TableBodyCell class="w-8 px-2 text-right font-semibold">{i + 1}</TableBodyCell>
													<TableBodyCell>{row.driver_name}</TableBodyCell>
													<TableBodyCell class="text-right font-bold">{row.total_points}</TableBodyCell>
													{#each rallies as r (r.id)}
														{@const rp = row.rally_points.find((x) => x.rally_id === r.id)}
														<TableBodyCell class="text-right font-mono">
															{#if rp}
																<span title="P{rp.position}">{rp.points}</span>
															{:else}
																<span class="opacity-40">—</span>
															{/if}
														</TableBodyCell>
													{/each}
												</TableBodyRow>
											{/each}
										</TableBody>
									</Table>
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
<Modal title="Rename Championship" bind:open={renameModalOpen} size="sm" autoclose={false}>
	<div class="flex flex-col gap-4">
		<Input
			bind:value={renameName}
			placeholder="Championship name"
			onkeydown={(e) => e.key === 'Enter' && renameChampionship()}
		/>
		<div class="flex justify-end gap-2">
			<Button color="light" onclick={() => (renameModalOpen = false)}>Cancel</Button>
			<Button onclick={renameChampionship} disabled={renaming || !renameName.trim()}>
				{renaming ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</div>
</Modal>

<!-- Create Championship Modal -->
<Modal title="New Championship" bind:open={createModalOpen} size="sm" autoclose={false}>
	<div class="flex flex-col gap-4">
		<Input
			bind:value={newChampName}
			placeholder="Championship name"
			onkeydown={(e) => e.key === 'Enter' && createChampionship()}
		/>
		<div class="flex justify-end gap-2">
			<Button color="light" onclick={() => (createModalOpen = false)}>Cancel</Button>
			<Button onclick={createChampionship} disabled={creating || !newChampName.trim()}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</div>
	</div>
</Modal>
