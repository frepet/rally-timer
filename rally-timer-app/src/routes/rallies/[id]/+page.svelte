<script lang="ts">
	import { env } from '$env/dynamic/public';
	import RallyResults from '../../../lib/RallyResults.svelte';
	import RallycrossLeaderboard from '../../../lib/RallycrossLeaderboard.svelte';
	import { buildStageData } from '../../../lib/domain/submittedRally';
	import { buildRallyRows } from '../../../lib/domain/summary';
	import { computeRallyRatings } from '../../../lib/domain/ratings';
	import {
		isRallycrossSubmission,
		buildRxDisplayFromSubmission
	} from '../../../lib/domain/rallycrossDisplay';

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
		championships: Championship[];
		driver_ratings: DriverRatingEntry[];
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
		}[];
	};

	const driverRatingsEnabled = env.PUBLIC_FEATURE_DRIVER_RATINGS === 'true';

	let { data }: { data: RallyDetail } = $props();

	const isRx = $derived(isRallycrossSubmission(data.results));
	const rxDisplay = $derived(isRx ? buildRxDisplayFromSubmission(data.results) : null);
	const stages = $derived(isRx ? [] : buildStageData(data.results));
	const rallyRows = $derived(isRx ? [] : buildRallyRows(stages));
	const initialRatings = $derived(
		new Map((data.driver_ratings ?? []).map((r) => [r.driver_uuid, r.rating_before]))
	);
	const ratings = $derived(
		driverRatingsEnabled && !isRx
			? computeRallyRatings(stages, initialRatings.size > 0 ? initialRatings : undefined)
			: null
	);

	function fmtDate(ms: number): string {
		return new Date(ms).toLocaleDateString('sv-SE');
	}
</script>

<div class="page">
	<section class="panel panel-body space-y-3">
		<h1 class="page-title break-words">{data.name}</h1>
		<div class="flex flex-wrap items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
			<span class="num">{fmtDate(Number(data.submitted_at))}</span>
			{#each data.championships as c (c.id)}
				<a href="/championships?id={c.id}" class="chip chip--primary hover:brightness-95"
					>{c.name}</a
				>
			{/each}
		</div>
	</section>

	{#if isRx && rxDisplay}
		<RallycrossLeaderboard standings={rxDisplay.standings} heats={rxDisplay.heats} />
	{:else}
		<RallyResults
			{rallyRows}
			{stages}
			ratings={driverRatingsEnabled ? ratings : null}
			initialRatings={driverRatingsEnabled ? initialRatings : null}
		/>
	{/if}
</div>
