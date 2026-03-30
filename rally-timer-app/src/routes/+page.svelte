<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { kcFetch } from '../lib/kcFetch'
	import type { BundleResponse } from '../lib/types'
	import RallyResults from '../lib/RallyResults.svelte'
	import { assignPositionsAndDeltas, type DisplayRallyRow, type StageData } from '../lib/results'

	type Driver = {
		id: number
		name: string
		class_id: number
		class_name: string
		rfid_tag: string | number | null
	}
	type Stage = { id: number; name: string }
	type StartEvent = { id: number; stage_id: number; driver_id: number; ts: number }
	type FinishEvent = { id: number; stage_id: number; ts: number; tag: string | number }

	let rallyRows = $state<DisplayRallyRow[]>([])
	let stageData = $state<StageData[]>([])

	let drivers: Driver[] = []
	let stages: Stage[] = []
	let starts: StartEvent[] = []
	let finishes: FinishEvent[] = []

	async function loadAllRaw() {
		const res = await kcFetch('/api/bundle')
		if (!res.ok) return
		const bundle: BundleResponse = await res.json()
		drivers = bundle.drivers
		stages = bundle.stages
		starts = bundle.start_events
		finishes = bundle.finish_events
	}

	function buildStageData(): StageData[] {
		const tagToDriver: Record<string | number, Driver> = {}
		for (const d of drivers) if (d.rfid_tag != null) tagToDriver[d.rfid_tag] = d

		return stages.map((stage) => {
			const driverStart: Record<number, StartEvent> = {}
			for (const se of starts) if (se.stage_id === stage.id) driverStart[se.driver_id] = se

			const firstFinishByDriver: Record<number, number> = {}
			for (const f of finishes.filter((x) => x.stage_id === stage.id)) {
				const drv = tagToDriver[f.tag]
				if (!drv) continue
				if (firstFinishByDriver[drv.id] === undefined || f.ts < firstFinishByDriver[drv.id]) {
					firstFinishByDriver[drv.id] = f.ts
				}
			}

			const rows = Object.entries(firstFinishByDriver).flatMap(([driverId, finishTs]) => {
				const drv = drivers.find((d) => d.id === Number(driverId))
				const se = drv ? driverStart[drv.id] : undefined
				if (!drv || !se) return []
				const stage_ms = finishTs - se.ts
				if (stage_ms < 0) return []
				return [{ driver_name: drv.name, class_name: drv.class_name, stage_ms, delta_p1: null, delta_prev: null, position: 0 }]
			})
			rows.sort((a, b) => a.stage_ms - b.stage_ms)
			assignPositionsAndDeltas(rows, (r) => r.stage_ms)
			return { name: stage.name, rows }
		})
	}

	function buildRallyRows(): DisplayRallyRow[] {
		const sd = buildStageData()
		const totals = new Map<number, { name: string; class_name: string; total: number; finished: number }>()
		for (const d of drivers) {
			let total = 0, finished = 0
			for (const s of sd) {
				const hit = s.rows.find((r) => r.driver_name === d.name)
				if (hit) { total += hit.stage_ms; finished++ }
			}
			if (finished > 0) totals.set(d.id, { name: d.name, class_name: d.class_name, total, finished })
		}
		const rows: DisplayRallyRow[] = [...totals.values()].map((v) => ({
			driver_name: v.name,
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

	async function recomputeAll() {
		stageData = buildStageData()
		rallyRows = buildRallyRows()
	}

	let poller: number | null = null

	onMount(async () => {
		await loadAllRaw()
		await recomputeAll()
		poller = window.setInterval(async () => {
			await loadAllRaw()
			await recomputeAll()
		}, 1000)
	})
	onDestroy(() => { if (poller) clearInterval(poller) })
</script>

<div class="w-full space-y-8 p-5">
	<RallyResults {rallyRows} stages={stageData} />
</div>
