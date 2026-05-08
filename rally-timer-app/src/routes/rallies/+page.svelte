<script lang="ts">
	import { Card, Button, Input, Select, Badge, Modal, Toggle } from 'flowbite-svelte';
	import {
		TrashBinOutline,
		DotsVerticalOutline,
		EditOutline,
		PlayOutline,
		AwardOutline,
		RefreshOutline
	} from 'flowbite-svelte-icons';
	import { SvelteSet } from 'svelte/reactivity';
	import { kcFetch } from '../../lib/kcFetch';
	import { isAdmin } from '../../lib/stores/auth';
	import { t } from '../../lib/stores/locale.svelte';

	type Stage = { id: number; name: string; event_count: number };
	type Gate = { id: string; name: string | null; last_seen: number; stage_id: number | null };
	type Driver = {
		id: number;
		name: string;
		tag: string;
		class_id?: number;
		class_name?: string;
		active: boolean;
	};
	type Championship = { id: string; name: string };

	// --- state
	let stages = $state<Stage[]>([]);
	let gates = $state<Gate[]>([]);
	let stageGateSelect = $state<Record<number, string>>({});
	let closeStageStatus = $state<Record<number, string>>({});
	let allDrivers = $state<Driver[]>([]);

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
		const menuHeight = 70;
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

	async function loadStages() {
		stages = await fetchJSON<Stage[]>('/api/stage');
	}

	async function createStage() {
		const name = newStageName.trim();
		if (!name) return;
		await kcFetchJSON(`/api/stage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		newStageName = '';
		await loadStages();
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
		const name = editName.trim();
		if (!name) {
			cancelEdit();
			return;
		}
		await kcFetchJSON(`/api/stage/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		cancelEdit();
		await loadStages();
	}
	async function deleteStage(id: number) {
		if (!confirm(t.deleteStageConfirm)) return;
		await kcFetch(`/api/stage/${id}`, { method: 'DELETE' });
		await loadStages();
	}

	async function closeStage(stageId: number) {
		if (!confirm(t.closeStageConfirm)) return;
		try {
			const result = await kcFetchJSON<{ dnfCount: number; gateMovedToStageId: number | null }>(
				`/api/stage/${stageId}/close`,
				{ method: 'POST' }
			);
			const moved = result.gateMovedToStageId ? t.gateMovedToStage(result.gateMovedToStageId) : '';
			closeStageStatus = {
				...closeStageStatus,
				[stageId]: t.stageClosedStatus(result.dnfCount, moved)
			};
		} catch (e) {
			closeStageStatus = {
				...closeStageStatus,
				[stageId]: `${t.errorPrefix} ${(e as Error).message}`
			};
		}
		await loadGates();
	}

	async function loadAllDrivers() {
		allDrivers = await fetchJSON<Driver[]>('/api/driver');
	}

	async function toggleDriver(id: number, active: boolean) {
		await kcFetchJSON(`/api/driver/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ active })
		});
		const d = allDrivers.find((x) => x.id === id);
		if (d) d.active = active;
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
		if (!confirm(t.unassignGateFromStageConfirm(gate.name ?? gate.id))) return;
		await kcFetchJSON(`/api/gate/${gate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: null })
		});
		await loadGates();
	}

	// --- Penalty
	type Finisher = {
		finish_event_id: number;
		timestamp: number;
		penalty_ms: number;
		driver_id: number;
		driver_name: string;
	};
	let penaltyModalOpen = $state(false);
	let penaltyStageId = $state<number | null>(null);
	let penaltyFinishers = $state<Finisher[]>([]);
	let penaltyDriverFinishEventId = $state<number | null>(null);
	let penaltySeconds = $state(10);
	let penaltySubmitting = $state(false);

	const selectedFinisher = $derived(
		penaltyFinishers.find((f) => f.finish_event_id === penaltyDriverFinishEventId) ?? null
	);

	async function openPenaltyModal() {
		penaltyStageId = stages[0]?.id ?? null;
		penaltyFinishers = [];
		penaltyDriverFinishEventId = null;
		penaltySeconds = 0;
		penaltyModalOpen = true;
		if (penaltyStageId) await loadFinishers(penaltyStageId);
	}

	async function loadFinishers(stageId: number) {
		penaltyFinishers = await fetchJSON<Finisher[]>(`/api/stage/${stageId}/finishers`);
		penaltyDriverFinishEventId = penaltyFinishers[0]?.finish_event_id ?? null;
		penaltySeconds = Math.round((penaltyFinishers[0]?.penalty_ms ?? 0) / 1000);
	}

	function selectPenaltyDriver(finishEventId: number) {
		penaltyDriverFinishEventId = finishEventId;
		const f = penaltyFinishers.find((f) => f.finish_event_id === finishEventId);
		penaltySeconds = Math.round((f?.penalty_ms ?? 0) / 1000);
	}

	async function applyPenalty() {
		if (!penaltyDriverFinishEventId || penaltySeconds == null) return;
		penaltySubmitting = true;
		try {
			await kcFetchJSON(`/api/finish/${penaltyDriverFinishEventId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ penalty_ms: penaltySeconds * 1000 })
			});
			penaltyModalOpen = false;
		} catch (e) {
			alert(t.applyFailed + ' ' + (e as Error).message);
		} finally {
			penaltySubmitting = false;
		}
	}

	// --- Clear rally
	let clearModalOpen = $state(false);
	let clearing = $state(false);

	async function clearRally() {
		clearing = true;
		try {
			const res = await kcFetch('/api/clear-rally', { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			clearModalOpen = false;
			await loadStages();
			await loadGates();
		} catch (e) {
			alert(t.clearFailed + ' ' + (e as Error).message);
		} finally {
			clearing = false;
		}
	}

	// --- Submit to championship
	let submitModalOpen = $state(false);
	let submitRallyName = $state('');
	let championships = $state<Championship[]>([]);
	let selectedChampIds = new SvelteSet<string>();
	let submitting = $state(false);
	let submitSuccess = $state<string | null>(null);

	async function openSubmitModal() {
		championships = await fetchJSON<Championship[]>('/api/championship');
		selectedChampIds.clear();
		submitRallyName = '';
		submitSuccess = null;
		submitModalOpen = true;
	}

	function toggleChampionship(id: string) {
		if (selectedChampIds.has(id)) selectedChampIds.delete(id);
		else selectedChampIds.add(id);
	}

	async function submitRally() {
		if (!submitRallyName.trim() || selectedChampIds.size === 0) return;
		submitting = true;
		try {
			const res = await kcFetch('/api/submit-rally', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: submitRallyName.trim(),
					championship_ids: Array.from(selectedChampIds)
				})
			});
			if (!res.ok) throw new Error(await res.text());
			const { id } = (await res.json()) as { id: string };
			submitSuccess = id;
		} catch (e) {
			alert(t.submitFailed + ' ' + (e as Error).message);
		} finally {
			submitting = false;
		}
	}

	// --- Drivers modal
	let driversModalOpen = $state(false);
	let driverSearch = $state('');

	const filteredDrivers = $derived.by(() => {
		const q = driverSearch.trim().toLowerCase();
		return allDrivers.filter(
			(d) =>
				!q || d.name.toLowerCase().includes(q) || (d.class_name ?? '').toLowerCase().includes(q)
		);
	});

	$effect(() => {
		loadStages();
		loadAllDrivers();
		loadGates();
		const t = setInterval(async () => {
			await Promise.all([loadStages(), loadGates()]);
		}, 5000);
		return () => clearInterval(t);
	});
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
		{#if assignedGatesForStage(menuStage.id).length > 0}
			<a href={`/stages/${menuStage.id}/start`} class="{stageMenuItemClass} sm:hidden">
				▶ Start
			</a>
		{/if}
		<button
			type="button"
			class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-600"
			onclick={() => {
				const id = menuStage!.id;
				openStageMenuId = null;
				deleteStage(id);
			}}
		>
			<TrashBinOutline size="xs" /> {t.delete}
		</button>
	</div>
{/if}

<div class="mx-auto w-full max-w-5xl space-y-6 p-5">
	<!-- Rally actions -->
	<Card class="max-w-none p-4">
		<div class="mb-3">
			<p class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
				{t.currentRally}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button size="sm" color="alternative" onclick={() => (driversModalOpen = true)}>
				{t.activeDriversButton}
			</Button>
			{#if $isAdmin}
				<Button size="sm" color="alternative" onclick={openPenaltyModal}>{t.penaltyButton}</Button>
				<Button size="sm" color="alternative" onclick={openSubmitModal}>
					<AwardOutline size="sm" class="mr-1" /> {t.submitToChampionshipButton}
				</Button>
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
					onclick={() => (clearModalOpen = true)}
				>
					<RefreshOutline size="sm" /> {t.clearRallyButton}
				</button>
			{/if}
		</div>
	</Card>

	<!-- Stages -->
	<Card class="max-w-none p-4">
		<div class="mb-4">
			<h2 class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
				{t.stagesHeading}
			</h2>
		</div>

		<!-- Stages Cards -->
		<div class="flex flex-col gap-3">
			{#each stages as s (s.id)}
				<div
					class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50"
				>
					<!-- Header: name + gate chips + pen icon (admin) -->
					<div class="mb-3 flex flex-wrap items-center gap-2">
						{#if editingId === s.id}
							<Input
								aria-label={t.stageNameAriaLabel}
								bind:value={editName}
								class="flex-1"
								onkeydown={(e) => {
									if (e.key === 'Enter') saveEdit(s.id);
									if (e.key === 'Escape') cancelEdit();
								}}
							/>
							<Button size="xs" onclick={() => saveEdit(s.id)}>{t.save}</Button>
							<Button size="xs" color="light" onclick={cancelEdit}>{t.cancel}</Button>
						{:else}
							<h3 class="font-mono text-base font-semibold text-gray-900 dark:text-gray-100">
								{s.name}
							</h3>
							{#each assignedGatesForStage(s.id) as g (g.id)}
								<span
									class="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700"
								>
									<span class="status-dot {isOnline(g) ? 'status-dot--ok' : 'status-dot--off'}"
									></span>
									<span class="font-mono text-xs text-gray-700 dark:text-gray-200"
										>{g.name ?? g.id.slice(0, 8)}</span
									>
									<span class="text-xs text-gray-500 dark:text-gray-400"
										>{isOnline(g) ? 'Online' : 'Offline'}</span
									>
									{#if $isAdmin}
										<button
											class="ml-0.5 text-gray-400 hover:text-red-500"
											onclick={() => unassignGate(g)}
											title={t.disconnectGateTitle}>×</button
										>
									{/if}
								</span>
							{/each}
							{#if $isAdmin}
								<button
									type="button"
									class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
									onclick={() => startEdit(s)}
									title={t.renameStageTitle}
								>
									<EditOutline size="sm" />
								</button>
							{/if}
							{#if !assignedGatesForStage(s.id).length}
								<span class="text-xs text-gray-400 dark:text-gray-500">{t.noGateAssigned}</span>
							{/if}
							{#if $isAdmin}
								<div class="ml-auto flex items-center gap-1">
									{#if availableGatesForAssign().length}
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
										<Button size="xs" onclick={() => assignGateToStage(s.id)}>{t.assign}</Button>
									{/if}
									<button
										type="button"
										onclick={(e) => openStageMenu(e, s.id)}
										class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
									>
										<DotsVerticalOutline class="text-gray-500 dark:text-gray-400" size="sm" />
									</button>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Actions row -->
					<div class="flex flex-wrap items-center gap-2">
						<!-- Start: hidden on mobile, visible sm+ -->
						{#if assignedGatesForStage(s.id).length > 0}
							<a
								href={`/stages/${s.id}/start`}
								class="hidden items-center gap-1 rounded px-2 py-1 text-sm font-medium text-green-600 hover:bg-gray-100 sm:inline-flex dark:text-green-400 dark:hover:bg-gray-700"
								title={t.openStartTitle}
							>
								<PlayOutline size="sm" /> {t.startButton}
							</a>
						{:else}
							<span class="hidden text-xs text-gray-400 sm:inline dark:text-gray-500"
								>{t.selectGateFirst}</span
							>
						{/if}

						<!-- Close Stage: admin only -->
						{#if $isAdmin}
							<Button size="xs" onclick={() => closeStage(s.id)}>{t.closeStageButton}</Button>
						{/if}

						<!-- Events: always visible -->
						<Button size="xs" color="alternative" href={`/stages/${s.id}/events`}>
							{t.eventsButton} ({s.event_count})
						</Button>
					</div>

					<!-- Close stage status -->
					{#if closeStageStatus[s.id]}
						<p class="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
							{closeStageStatus[s.id]}
						</p>
					{/if}
				</div>
			{/each}
			{#if !stages.length}
				<p
					class="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500"
				>
					{t.noStagesYet}
				</p>
			{/if}
		</div>

		{#if $isAdmin}
			<!-- Add Stage -->
			<div class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div>
						<Input
							id="stageName"
							bind:value={newStageName}
							placeholder="SS1"
							onkeydown={(e) => e.key === 'Enter' && createStage()}
						/>
					</div>
					<div class="flex items-end">
						<Button class="w-full md:w-32" onclick={createStage}>{t.addStage}</Button>
					</div>
				</div>
			</div>
		{/if}
	</Card>
</div>

<!-- Penalty Modal -->
<Modal title={t.penaltyModal} bind:open={penaltyModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<div>
			<label for="penaltyStage" class="mb-1 block text-sm font-medium">{t.stageLabel}</label>
			<Select
				id="penaltyStage"
				value={penaltyStageId ?? ''}
				onchange={async (e) => {
					penaltyStageId = Number((e.currentTarget as HTMLSelectElement).value);
					await loadFinishers(penaltyStageId);
				}}
			>
				{#each stages as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</Select>
		</div>
		<div>
			<label for="penaltyDriver" class="mb-1 block text-sm font-medium">{t.driverLabel}</label>
			{#if penaltyFinishers.length}
				<Select
					id="penaltyDriver"
					value={penaltyDriverFinishEventId ?? ''}
					onchange={(e) =>
						selectPenaltyDriver(Number((e.currentTarget as HTMLSelectElement).value))}
				>
					{#each penaltyFinishers as f (f.finish_event_id)}
						<option value={f.finish_event_id}>{f.driver_name}</option>
					{/each}
				</Select>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">{t.noFinishers}</p>
			{/if}
		</div>
		<div>
			<label for="penaltySecs" class="mb-1 block text-sm font-medium">
				{t.penaltySeconds}{#if selectedFinisher && selectedFinisher.penalty_ms > 0}
					<span class="ml-2 font-normal text-amber-600 dark:text-amber-400">
						{t.currentPenaltyPrefix} +{selectedFinisher.penalty_ms / 1000}s
					</span>
				{/if}
			</label>
			<Input id="penaltySecs" type="number" min="0" bind:value={penaltySeconds} />
			{#if penaltySeconds === 0}
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.removePenaltyHint}</p>
			{/if}
		</div>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (penaltyModalOpen = false)}>{t.cancel}</Button>
			<Button
				onclick={applyPenalty}
				disabled={penaltySubmitting || !penaltyDriverFinishEventId || penaltySeconds == null}
			>
				{penaltySubmitting ? t.applying : penaltySeconds === 0 ? t.removePenalty : t.applyPenalty}
			</Button>
		</div>
	</div>
</Modal>

<!-- Active Drivers Modal -->
<Modal title={t.activeDriversModal} bind:open={driversModalOpen} size="md" autoclose={false}>
	<div class="mb-3">
		<Input size="sm" placeholder={t.searchDriversPlaceholder} bind:value={driverSearch} />
	</div>
	<ul class="max-h-96 space-y-2 overflow-y-auto">
		{#each filteredDrivers as d (d.id)}
			<li class="flex items-center justify-between gap-2 rounded border p-2">
				<span>{d.name}{d.class_name ? ` — ${d.class_name}` : ''}</span>
				{#if $isAdmin}
					<Toggle checked={d.active} onchange={() => toggleDriver(d.id, !d.active)} size="small" />
				{:else}
					<Badge color={d.active ? 'green' : 'gray'}>{d.active ? t.active : t.inactive}</Badge>
				{/if}
			</li>
		{/each}
		{#if !filteredDrivers.length}
			<li class="text-gray-500 dark:text-gray-400">
				{driverSearch ? t.noMatches : t.noDrivers}
			</li>
		{/if}
	</ul>
	<div class="mt-4 border-t pt-3">
		<a href="/drivers" class="text-sm text-blue-600 hover:underline dark:text-blue-400"
			>{t.manageAddDrivers}</a
		>
	</div>
</Modal>

<!-- Clear Rally Modal -->
<Modal title={t.clearRallyModal} bind:open={clearModalOpen} size="sm" autoclose={false}>
	<div class="space-y-4">
		<p class="text-gray-700 dark:text-gray-300">{t.clearRallyDescription}</p>
		<p class="font-semibold text-red-600 dark:text-red-400">{t.cannotBeUndone}</p>
		<div class="flex justify-end gap-2 border-t pt-3">
			<Button color="alternative" onclick={() => (clearModalOpen = false)}>{t.cancel}</Button>
			<Button color="red" onclick={clearRally} disabled={clearing}>
				{clearing ? t.clearing : t.clearRallyButton}
			</Button>
		</div>
	</div>
</Modal>

<!-- Submit to Championship Modal -->
<Modal title={t.submitRallyModal} bind:open={submitModalOpen} size="md" autoclose={false}>
	{#if submitSuccess}
		<div class="space-y-4">
			<p class="font-medium text-green-600 dark:text-green-400">{t.rallySubmitted}</p>
			<div class="flex justify-end gap-2">
				<a href="/championships" class="text-sm text-blue-600 hover:underline dark:text-blue-400">
					{t.viewChampionships}
				</a>
				<Button color="alternative" onclick={() => (submitModalOpen = false)}>{t.close}</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			<div>
				<label for="rallyName" class="mb-1 block text-sm font-medium">{t.rallyNameLabel}</label>
				<Input id="rallyName" bind:value={submitRallyName} placeholder={t.rallyNamePlaceholder} />
			</div>
			<div>
				<p class="mb-2 text-sm font-medium">{t.submitToChampionshipLabel}</p>
				{#if championships.length}
					<ul class="max-h-48 space-y-1 overflow-y-auto">
						{#each championships as c (c.id)}
							<li>
								<label
									class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-700"
								>
									<input
										type="checkbox"
										checked={selectedChampIds.has(c.id)}
										onchange={() => toggleChampionship(c.id)}
										class="rounded"
									/>
									<span>{c.name}</span>
								</label>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						{t.noChampionshipsYetCreate}
						<a href="/championships" class="text-blue-600 hover:underline dark:text-blue-400"
							>{t.createOne}</a
						>
					</p>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t pt-3">
				<Button color="alternative" onclick={() => (submitModalOpen = false)}>{t.cancel}</Button>
				<Button
					onclick={submitRally}
					disabled={submitting || !submitRallyName.trim() || selectedChampIds.size === 0}
				>
					{submitting ? t.sending : t.send}
				</Button>
			</div>
		</div>
	{/if}
</Modal>
