<script lang="ts">
	import { onMount } from 'svelte';
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
		Badge,
		P,
		Modal,
		Tabs,
		TabItem
	} from 'flowbite-svelte';
	import { TrashBinOutline, PlusOutline } from 'flowbite-svelte-icons';
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
			await selectChampionship(championships[0].id);
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

	// Group standings by class
	const classes = $derived([...new Set(standings.map((s) => s.class_name))].sort());
	const standingsByClass = $derived(
		Object.fromEntries(classes.map((cls) => [cls, standings.filter((s) => s.class_name === cls)]))
	);

	function fmtDate(ms: number): string {
		return new Date(ms).toLocaleDateString();
	}

	const selectedChamp = $derived(championships.find((c) => c.id === selectedId) ?? null);

	onMount(loadChampionships);
</script>

<div class="w-full space-y-6 p-5">
	<div class="flex items-center justify-between">
		<P class="text-3xl font-bold">Championships</P>
		{#if $isAdmin}
			<Button size="sm" onclick={() => (createModalOpen = true)}>
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
		<div class="flex flex-col gap-6 lg:flex-row">
			<!-- Championship list -->
			<Card class="w-full p-4 lg:w-64 lg:flex-none">
				<P class="mb-3 font-semibold">Championships</P>
				<ul class="space-y-1">
					{#each championships as c (c.id)}
						<li class="flex items-center gap-1">
							<button
								class="flex-1 rounded px-3 py-2 text-left text-sm transition-colors {selectedId ===
								c.id
									? 'bg-blue-100 font-semibold dark:bg-blue-900'
									: 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
								onclick={() => selectChampionship(c.id)}
							>
								{c.name}
							</button>
							{#if $isAdmin}
								<button
									class="rounded p-1 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
									title="Delete"
									onclick={() => deleteChampionship(c.id)}
								>
									<TrashBinOutline size="xs" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</Card>

			<!-- Championship detail -->
			<div class="flex-1 space-y-4">
				{#if selectedChamp}
					<P class="text-2xl font-bold">{selectedChamp.name}</P>

					<!-- Rallies list -->
					{#if rallies.length}
						<Card class="max-w-none p-4">
							<P class="mb-2 font-semibold">Included Rallies</P>
							<div class="flex flex-wrap gap-2">
								{#each rallies as r (r.id)}
									<Badge color="blue">{r.name} ({fmtDate(r.submitted_at)})</Badge>
								{/each}
							</div>
						</Card>
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
						<Tabs style="underline">
							{#each classes as cls (cls)}
								<TabItem title={cls} open={cls === classes[0]}>
									<Card class="max-w-none p-4">
										<Table hoverable>
											<TableHead>
												<TableHeadCell>#</TableHeadCell>
												<TableHeadCell>Driver</TableHeadCell>
												<TableHeadCell>Points</TableHeadCell>
												{#each rallies as r (r.id)}
													<TableHeadCell class="text-center text-xs">{r.name}</TableHeadCell>
												{/each}
											</TableHead>
											<TableBody>
												{#each standingsByClass[cls] as row, i (row.driver_uuid)}
													<TableBodyRow>
														<TableBodyCell class="font-semibold">{i + 1}</TableBodyCell>
														<TableBodyCell>{row.driver_name}</TableBodyCell>
														<TableBodyCell class="font-bold">{row.total_points}</TableBodyCell>
														{#each rallies as r (r.id)}
															{@const rp = row.rally_points.find((x) => x.rally_id === r.id)}
															<TableBodyCell class="text-center font-mono">
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
				{/if}
			</div>
		</div>
	{/if}
</div>

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
