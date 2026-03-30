<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { kcFetch } from '../lib/kcFetch'
	import type { BundleResponse } from '../lib/types'
	import RallyResults from '../lib/RallyResults.svelte'
	import { assignPositionsAndDeltas, type DisplayRallyRow, type StageData } from '../lib/results'
	import { calculateStageTime } from '../lib/domain/timing'

	type Driver = {
		id: number
		name: string
		class_id: number
		class_name: string
		rfid_tag: string | number | null
	}
	type Stage = { id: number; name: string }
	type StartEvent = { id: number; stage_id: number; driver_id: number; ts: number | string }
	type FinishEvent = { id: number; stage_id: number; ts: number | string; tag: string | number }

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
		return stages.map((stage) => {
			const rows = drivers.flatMap((driver) => {
				if (driver.rfid_tag == null) return []

				const driverStarts = starts
					.filter((se) => se.stage_id === stage.id && se.driver_id === driver.id)
					.map((se) => Number(se.ts))

				const driverFinishes = finishes
					.filter((fe) => fe.stage_id === stage.id && String(fe.tag) === String(driver.rfid_tag))
					.map((fe) => Number(fe.ts))

				const elapsed = calculateStageTime(driverStarts, driverFinishes)
				if (elapsed === null) return []

				return [{ driver_name: driver.name, class_name: driver.class_name, stage_ms: elapsed, delta_p1: null, delta_prev: null, position: 0 }]
			})
			rows.sort((a, b) => a.stage_ms - b.stage_ms)
			assignPositionsAndDeltas(rows, (r) => r.stage_ms)
			return { name: stage.name, rows }
		})
	}

	function buildRallyRows(sd: StageData[]): DisplayRallyRow[] {
		const totals = new Map<string, { class_name: string; total: number; finished: number }>()
		for (const stage of sd) {
			for (const row of stage.rows) {
				const existing = totals.get(row.driver_name) ?? { class_name: row.class_name, total: 0, finished: 0 }
				existing.total += row.stage_ms
				existing.finished++
				totals.set(row.driver_name, existing)
			}
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

	async function recomputeAll() {
		stageData = buildStageData()
		rallyRows = buildRallyRows(stageData)
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
