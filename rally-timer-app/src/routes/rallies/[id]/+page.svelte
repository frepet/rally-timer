<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { page } from '$app/state';
	import { Button, Input } from 'flowbite-svelte';
	import { EditOutline } from 'flowbite-svelte-icons';
	import { kcFetch } from '../../../lib/kcFetch';
	import { auth } from '../../../lib/stores/auth.svelte';
	import RallyResults from '../../../lib/RallyResults.svelte';
	import RallycrossLeaderboard from '../../../lib/RallycrossLeaderboard.svelte';
	import TrainingResults from '../../../lib/TrainingResults.svelte';
	import { buildStageData } from '../../../lib/domain/submittedRally';
	import { buildRallyRows } from '../../../lib/domain/summary';
	import { computeRallyRatings } from '../../../lib/domain/ratings';
	import {
		isRallycrossSubmission,
		buildRxDisplayFromSubmission,
		applyRxRatings
	} from '../../../lib/domain/rallycrossDisplay';
	import type { TrainingDriverResult } from '../../../lib/domain/training';
	import { t } from '../../../lib/stores/locale.svelte';

	type Championship = { id: string; name: string };
	type DriverRatingEntry = {
		driver_uuid: string;
		driver_name: string;
		rating_before: number;
		rating_after: number;
	};
	type RallyDetail = {
		name: string;
		submitted_at: number;
		event_type: 'rally' | 'rallycross' | 'training';
		championships: Championship[];
		driver_ratings: DriverRatingEntry[];
		training_results: TrainingDriverResult[];
		results: {
			driver_uuid: string;
			driver_name: string;
			class_name: string;
			stage_name: string;
			stage_order: number;
			elapsed_ms: number | null;
			best_lap_ms: number | null;
			dnf: boolean;
			synthetic: boolean;
			heat_position: number | null;
		}[];
	};

	const driverRatingsEnabled = env.PUBLIC_FEATURE_DRIVER_RATINGS === 'true';

	let { data }: { data: RallyDetail } = $props();

	const isRx = $derived(isRallycrossSubmission(data.results));
	const stages = $derived(isRx ? [] : buildStageData(data.results));
	const rallyRows = $derived(isRx ? [] : buildRallyRows(stages));
	const initialRatings = $derived(
		new Map((data.driver_ratings ?? []).map((r) => [r.driver_uuid, r.rating_before]))
	);
	const rxDisplay = $derived.by(() => {
		if (!isRx) return null;
		const display = buildRxDisplayFromSubmission(data.results);
		return driverRatingsEnabled ? applyRxRatings(display, initialRatings) : display;
	});
	const ratings = $derived(
		driverRatingsEnabled && !isRx
			? computeRallyRatings(stages, initialRatings.size > 0 ? initialRatings : undefined)
			: null
	);

	let shownName = $state<string | null>(null);
	let editingName = $state(false);
	let nameDraft = $state('');
	let renaming = $state(false);
	let renameError = $state('');

	function startRename() {
		nameDraft = shownName ?? data.name;
		renameError = '';
		editingName = true;
	}

	async function saveName() {
		const name = nameDraft.trim();
		if (!name) return;
		if (name === (shownName ?? data.name)) {
			editingName = false;
			return;
		}
		renaming = true;
		renameError = '';
		try {
			const res = await kcFetch(`/api/submitted-rally/${page.params.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!res.ok) throw new Error(await res.text());
			shownName = ((await res.json()) as { name: string }).name;
			editingName = false;
		} catch (e) {
			renameError = String(e);
		} finally {
			renaming = false;
		}
	}

	function onNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveName();
		if (e.key === 'Escape') editingName = false;
	}

	function fmtDate(ms: number): string {
		return new Date(ms).toLocaleDateString('sv-SE');
	}
</script>

<div class="page">
	<section class="panel panel-body space-y-3">
		{#if editingName}
			<div class="flex w-full max-w-lg items-center gap-2">
				<div class="min-w-0 flex-1">
					<Input
						aria-label={t.eventName}
						bind:value={nameDraft}
						onkeydown={onNameKeydown}
						disabled={renaming}
						autofocus
					/>
				</div>
				<Button size="sm" onclick={saveName} disabled={renaming || !nameDraft.trim()}
					>{t.save}</Button
				>
				<Button
					size="sm"
					color="alternative"
					onclick={() => (editingName = false)}
					disabled={renaming}>{t.cancel}</Button
				>
			</div>
			{#if renameError}<p class="text-sm text-red-600">{renameError}</p>{/if}
		{:else}
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="page-title break-words">{shownName ?? data.name}</h1>
				{#if auth.isAdmin}
					<button
						type="button"
						class="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-800 dark:hover:bg-white/10 dark:hover:text-surface-100"
						onclick={startRename}
						aria-label={t.eventRename}
						title={t.eventRename}
					>
						<EditOutline size="md" />
					</button>
				{/if}
			</div>
		{/if}
		<div class="flex flex-wrap items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
			<span class="num">{fmtDate(Number(data.submitted_at))}</span>
			{#if data.event_type === 'training'}
				<span class="chip chip--ok">{t.navTraining}</span>
			{/if}
			{#each data.championships as c (c.id)}
				<a href="/championships?id={c.id}" class="chip chip--primary hover:brightness-95"
					>{c.name}</a
				>
			{/each}
		</div>
	</section>

	{#if data.event_type === 'training'}
		<TrainingResults drivers={data.training_results} />
	{:else if isRx && rxDisplay}
		<RallycrossLeaderboard
			standings={rxDisplay.standings}
			heats={rxDisplay.heats}
			showRatings={driverRatingsEnabled}
		/>
	{:else}
		<RallyResults
			{rallyRows}
			{stages}
			ratings={driverRatingsEnabled ? ratings : null}
			initialRatings={driverRatingsEnabled ? initialRatings : null}
		/>
	{/if}
</div>
