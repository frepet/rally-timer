<script lang="ts">
	import { Badge, P } from 'flowbite-svelte'
	import RallyResults from '../../../lib/RallyResults.svelte'
	import { assignPositionsAndDeltas, type DisplayRallyRow, type StageData } from '../../../lib/results'

	type RallyResult = {
		driver_name: string
		class_name: string
		stage_name: string
		elapsed_ms: number | null
	}
	type Championship = { id: string; name: string }
	type RallyDetail = {
		id: string
		name: string
		submitted_at: number
		championships: Championship[]
		results: RallyResult[]
	}

	let { data }: { data: RallyDetail } = $props()

	function buildStageData(results: RallyResult[]): StageData[] {
		const stageNames = [...new Set(results.map((r) => r.stage_name))]
		return stageNames.map((stageName) => {
			const rows = results
				.filter((r) => r.stage_name === stageName && r.elapsed_ms != null)
				.map((r) => ({
					driver_name: r.driver_name,
					class_name: r.class_name,
					stage_ms: r.elapsed_ms as number,
					delta_p1: null,
					delta_prev: null,
					position: 0
				}))
			rows.sort((a, b) => a.stage_ms - b.stage_ms)
			assignPositionsAndDeltas(rows, (r) => r.stage_ms)
			return { name: stageName, rows }
		})
	}

	function buildRallyRows(results: RallyResult[]): DisplayRallyRow[] {
		const totals = new Map<string, { class_name: string; total: number; finished: number }>()
		for (const r of results) {
			if (r.elapsed_ms == null) continue
			const existing = totals.get(r.driver_name) ?? { class_name: r.class_name, total: 0, finished: 0 }
			existing.total += r.elapsed_ms
			existing.finished++
			totals.set(r.driver_name, existing)
		}
		const rows: DisplayRallyRow[] = [...totals.entries()].map(([name, v]) => ({
			driver_name: name,
			class_name: v.class_name,
			total_ms: v.total,
			finished_stages: v.finished,
			delta_p1: null,
			delta_prev: null,
			position: 0
		}))
		rows.sort((a, b) => a.total_ms - b.total_ms)
		assignPositionsAndDeltas(rows, (r) => r.total_ms)
		return rows
	}

	const stages = $derived(buildStageData(data.results))
	const rallyRows = $derived(buildRallyRows(data.results))

	function fmtDate(ms: number): string {
		return new Date(ms).toLocaleDateString('sv-SE')
	}
</script>

<div class="w-full space-y-6 p-5">
	<div>
		<P class="text-3xl font-bold">{data.name}</P>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
			<span>{fmtDate(Number(data.submitted_at))}</span>
			{#each data.championships as c (c.id)}
				<a href="/championships?id={c.id}">
					<Badge color="blue" class="cursor-pointer hover:brightness-90">{c.name}</Badge>
				</a>
			{/each}
		</div>
	</div>

	<RallyResults {rallyRows} {stages} />
</div>
