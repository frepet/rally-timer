<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { Badge, P } from 'flowbite-svelte';
	import RallyResults from '../../../lib/RallyResults.svelte';
	import RallyResultsLab from '../../../lib/RallyResultsLab.svelte';
	import RallycrossLeaderboard from '../../../lib/RallycrossLeaderboard.svelte';
	import { buildStageData } from '../../../lib/domain/submittedRally';
	import { buildRallyRows } from '../../../lib/domain/summary';
	import { computeRallyRatings } from '../../../lib/domain/ratings';
	import {
		isRallycrossSubmission,
		buildRxDisplayFromSubmission
	} from '../../../lib/domain/rallycrossDisplay';

	type Championship = { id: string; name: string };
	type DriverRatingEntry = { driver_uuid: string; driver_name: string; rating_before: number; rating_after: number };
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
			elapsed_ms: number | null;
			best_lap_ms: number | null;
			dnf: boolean;
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

<div class="w-full space-y-6 p-5">
	<div>
		<P class="text-3xl font-bold">{data.name}</P>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
			<span>{fmtDate(Number(data.submitted_at))}</span>
			{#each data.championships as c (c.id)}
				<a href="/championships?id={c.id}">
					<Badge
						color="primary"
						class="cursor-pointer bg-primary-700 text-white hover:brightness-90 dark:bg-primary-700 dark:text-white"
						>{c.name}</Badge
					>
				</a>
			{/each}
		</div>
	</div>

	{#if isRx && rxDisplay}
		<RallycrossLeaderboard standings={rxDisplay.standings} heats={rxDisplay.heats} />
	{:else if driverRatingsEnabled}
		<RallyResultsLab {rallyRows} {stages} {ratings} />
	{:else}
		<RallyResults {rallyRows} {stages} />
	{/if}
</div>
