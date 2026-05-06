<script lang="ts">
	import { Badge, P } from 'flowbite-svelte';
	import RallyResults from '../../../lib/RallyResults.svelte';
	import { buildStageData } from '../../../lib/domain/submittedRally';
	import { buildRallyRows } from '../../../lib/domain/summary';

	type Championship = { id: string; name: string };
	type RallyDetail = {
		id: string;
		name: string;
		submitted_at: number;
		championships: Championship[];
		results: {
			driver_name: string;
			class_name: string;
			stage_name: string;
			elapsed_ms: number | null;
			dnf: boolean;
		}[];
	};

	let { data }: { data: RallyDetail } = $props();

	const stages = $derived(buildStageData(data.results));
	const rallyRows = $derived(buildRallyRows(stages));

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

	<RallyResults {rallyRows} {stages} />
</div>
