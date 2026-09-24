<script lang="ts">
	import { untrack } from 'svelte';
	import StagePicker from './components/StagePicker.svelte';
	import { classChipClass } from './classColor';
	import { formatMs, type DisplayRallyRow, type StageData } from './results';
	import { t } from './stores/locale.svelte';
	import type { RallyRatings } from './domain/ratings';

	let {
		rallyRows,
		stages,
		ratings = null,
		initialRatings = null
	}: {
		rallyRows: DisplayRallyRow[];
		stages: StageData[];
		ratings?: RallyRatings | null;
		initialRatings?: Map<string, number> | null;
	} = $props();

	function defaultStage(stages: StageData[]): string | null {
		return (
			stages.find((s) => s.status === 'live')?.name ??
			stages.findLast((s) => s.status === 'closed')?.name ??
			stages.find((s) => s.status === 'upcoming')?.name ??
			stages[0]?.name ??
			null
		);
	}

	let activeStage = $state(untrack(() => defaultStage(stages)));

	$effect(() => {
		if (activeStage == null && stages.length) activeStage = defaultStage(stages);
	});

	// More than one finished-stages group only happens while a stage is live.
	const multipleGroups = $derived(rallyRows.some((r, i) => i > 0 && r.group_leader));

	const activeStageData = $derived(stages.find((s) => s.name === activeStage) ?? null);
	const activeRows = $derived(activeStageData?.rows ?? []);

	type ScheduleData = {
		server_now_ms: number;
		scheduled: { driver_id: number; ts_ms: number; name: string; class_name: string }[];
		remaining: { driver_id: number; name: string; class_name: string }[];
	};

	let scheduleData = $state<ScheduleData>({ server_now_ms: 0, scheduled: [], remaining: [] });

	$effect(() => {
		const stageId = activeStageData?.id;
		const status = activeStageData?.status;
		if (stageId != null && status !== 'closed') {
			fetch(`/api/stage/${stageId}/schedule`)
				.then((r) => (r.ok ? r.json() : { server_now_ms: 0, scheduled: [], remaining: [] }))
				.then((data: ScheduleData) => {
					scheduleData = data;
				});
		} else {
			scheduleData = { server_now_ms: 0, scheduled: [], remaining: [] };
		}
	});

	// All scheduled drivers (past + future) in order, plus unscheduled remaining.
	// Drivers whose ts_ms has passed are marked started=true and rendered invisible
	// so their slot stays in the list and later entries keep their original position number.
	const startOrder = $derived.by(() => {
		const nowMs = scheduleData.server_now_ms || Date.now();
		return [
			...scheduleData.scheduled.map((s) => ({
				id: s.driver_id,
				name: s.name,
				class_name: s.class_name,
				started: s.ts_ms <= nowMs
			})),
			...scheduleData.remaining.map((r) => ({
				id: r.driver_id,
				name: r.name,
				class_name: r.class_name,
				started: false
			}))
		];
	});

	function fmtDelta(delta: number): string {
		return delta >= 0 ? `+${delta}` : `${delta}`;
	}
</script>

<div class="grid items-start gap-6 xl:grid-cols-2">
	<!-- Rally leaderboard -->
	<section class="panel overflow-hidden">
		<div class="panel-head">
			<h2 class="panel-title">{t.rallyLeaderboard}</h2>
		</div>
		{#if rallyRows.length}
			<div class="timing-list">
				{#each rallyRows as r (r.driver_uuid)}
					{#if multipleGroups && r.group_leader}
						<div class="group-divider" role="separator">
							<span>{t.stagesCompletedGroup(r.finished_stages)}</span>
						</div>
					{/if}
					<div class="timing-row">
						<span class="pos {r.position <= 3 ? `pos--${r.position}` : ''}">{r.position}</span>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="truncate font-semibold text-surface-900 dark:text-white"
									>{r.driver_name}</span
								>
								<span class="chip {classChipClass(r.class_name)}">{r.class_name}</span>
							</div>
							<div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
								{#if !r.group_leader}
									<span class="stat"
										><span class="stat-label">{t.totalLabel}</span>{formatMs(r.total_ms)}</span
									>
								{/if}
								<span class="stat"
									><span class="stat-label">{t.stagesStatLabel}</span>{r.finished_stages}</span
								>
								{#if r.dnf_count > 0}
									<span class="chip chip--danger">{t.dnfStatLabel(r.dnf_count)}</span>
								{/if}
								{#if r.penalty_ms > 0}
									<span class="stat text-amber-700 dark:text-amber-400"
										><span class="stat-label !text-current opacity-70">{t.penaltyLabel}</span
										>+{formatMs(r.penalty_ms)}</span
									>
								{/if}
								{#if ratings}
									{@const finalRating = ratings.finalRatings.get(r.driver_uuid)}
									{#if finalRating != null}
										{@const initRating = initialRatings?.get(r.driver_uuid) ?? 1500}
										{@const ratingDelta = finalRating - initRating}
										<span class="stat text-violet-700 dark:text-violet-400"
											><span class="stat-label !text-current opacity-70">{t.ratingLabel}</span
											>{finalRating}<span class="ml-1 opacity-70">({fmtDelta(ratingDelta)})</span
											></span
										>
									{/if}
								{/if}
							</div>
						</div>
						<div class="flex flex-col items-end">
							<span
								class="time text-xl sm:text-2xl {r.group_leader
									? 'text-surface-900 dark:text-white'
									: 'text-surface-700 dark:text-surface-200'}"
							>
								{#if r.group_leader}
									{formatMs(r.total_ms)}
								{:else}
									{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
								{/if}
							</span>
							{#if !r.group_leader}
								<span class="stat"
									><span class="stat-label">Δ P1</span>{r.delta_p1 != null
										? '+' + formatMs(r.delta_p1)
										: '—'}</span
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="p-4 sm:p-6"><p class="empty dark:text-surface-400">{t.noResultsYet}</p></div>
		{/if}
	</section>

	<!-- Stage tabs + leaderboard -->
	<section class="panel overflow-hidden">
		<div class="panel-head">
			<h2 class="panel-title">{t.stageLeaderboard}</h2>
		</div>
		<div class="border-b border-surface-100 px-4 py-3 sm:px-6 dark:border-white/8">
			{#if stages.length}
				<StagePicker {stages} active={activeStage} onselect={(name) => (activeStage = name)} />
			{:else}
				<span class="text-sm text-surface-500 dark:text-surface-400">{t.noStagesYet}</span>
			{/if}
		</div>

		{#if activeStage}
			{#if activeStageData?.status !== 'closed' && startOrder.some((e) => !e.started)}
				<div class="border-b border-surface-100 px-4 py-3 sm:px-6 dark:border-white/8">
					<p class="eyebrow mb-2">{t.startOrder}</p>
					<ol class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
						{#each startOrder as entry, i (entry.id)}
							{#if !entry.started}
								<li class="flex items-center gap-3 text-sm">
									<span class="time w-6 text-right text-base text-surface-400 dark:text-surface-500"
										>{i + 1}</span
									>
									<span class="truncate font-medium text-surface-900 dark:text-white"
										>{entry.name}</span
									>
									<span class="chip {classChipClass(entry.class_name)}">{entry.class_name}</span>
								</li>
							{/if}
						{/each}
					</ol>
				</div>
				<p class="eyebrow px-4 pt-3 sm:px-6">{t.resultsSubheading}</p>
			{/if}
			{#if activeRows.length}
				<div class="timing-list">
					{#each activeRows as r (r.driver_uuid)}
						<div class="timing-row">
							{#if r.dnf}
								<span class="chip chip--danger justify-self-center">DNF</span>
							{:else}
								<span class="pos {r.position <= 3 ? `pos--${r.position}` : ''}">{r.position}</span>
							{/if}
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="truncate font-semibold text-surface-900 dark:text-white"
										>{r.driver_name}</span
									>
									<span class="chip {classChipClass(r.class_name)}">{r.class_name}</span>
									{#if r.synthetic}
										<span class="chip chip--warn" title={t.syntheticBadgeTitle}
											>{t.syntheticBadge}</span
										>
									{/if}
								</div>
								<div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
									{#if r.position !== 1}
										<span class="stat"
											><span class="stat-label">{t.timeLabel}</span>{formatMs(r.stage_ms)}</span
										>
									{/if}
									{#if r.penalty_ms > 0}
										<span class="stat text-amber-700 dark:text-amber-400"
											><span class="stat-label !text-current opacity-70">{t.penaltyLabel}</span
											>+{formatMs(r.penalty_ms)}</span
										>
									{/if}
									{#if ratings && activeStage}
										{@const delta = ratings.stageDeltas.get(activeStage)?.get(r.driver_uuid)}
										{#if delta != null}
											<span
												class="stat {delta >= 0
													? 'text-green-700 dark:text-green-400'
													: 'text-red-600 dark:text-red-400'}"
												><span class="stat-label !text-current opacity-70"
													>{t.ratingDeltaLabel}</span
												>{fmtDelta(delta)}</span
											>
										{/if}
									{/if}
								</div>
							</div>
							<div class="flex flex-col items-end">
								<span
									class="time text-xl sm:text-2xl {r.dnf
										? 'text-surface-400 dark:text-surface-500'
										: r.position === 1
											? 'text-surface-900 dark:text-white'
											: 'text-surface-700 dark:text-surface-200'}"
								>
									{#if r.dnf || r.position === 1}
										{formatMs(r.stage_ms)}
									{:else}
										{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}
									{/if}
								</span>
								{#if r.position !== 1 && !r.dnf}
									<span class="stat"
										><span class="stat-label">Δ P1</span>{r.delta_p1 != null
											? '+' + formatMs(r.delta_p1)
											: '—'}</span
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="p-4 sm:p-6">
					<p class="empty dark:text-surface-400">{t.noStageResultsYet}</p>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.group-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background-color: var(--color-surface-50);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-surface-500);
	}
	.group-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background-color: var(--color-surface-200);
	}
	:global(.dark) .group-divider {
		background-color: rgb(255 255 255 / 0.03);
		color: var(--color-surface-400);
	}
	:global(.dark) .group-divider::after {
		background-color: rgb(255 255 255 / 0.1);
	}
</style>
