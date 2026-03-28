<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Card,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Button,
		Heading
	} from 'flowbite-svelte';
	import { kcFetch } from '../lib/kcFetch';
	import type { BundleResponse } from '../lib/types';

	// -------- Types --------
	type Driver = {
		id: number;
		name: string;
		class_id: number;
		class_name: string;
		rfid_tag: string | number | null;
	};
	type Stage = { id: number; name: string };
	type StartEvent = { id: number; stage_id: number; driver_id: number; ts: number };
	type FinishEvent = { id: number; stage_id: number; ts: number; tag: string | number };

	type RallyRow = {
		driver_id: number;
		driver_name: string;
		class_name: string;
		total_ms: number;
		delta_p1: number | null;
		delta_prev: number | null;
		position: number;
		finished_stages: number;
	};
	type StageRow = {
		driver_id: number;
		driver_name: string;
		class_name: string;
		stage_ms: number;
		delta_p1: number | null;
		delta_prev: number | null;
		position: number;
	};

	// -------- UI state --------
	let rallyRows = $state<RallyRow[]>([]);
	let stages = $state<Stage[]>([]);
	let stageRows = $state<StageRow[]>([]);
	let activeStageId = $state<number | null>(null);

	// Raw caches
	let drivers: Driver[] = [];
	let starts: StartEvent[] = [];
	let finishes: FinishEvent[] = [];

	// -------- Utils --------
	function formatMs(ms: number | null | undefined): string {
		if (ms == null) return '—';
		const sec = Math.floor(ms / 1000);
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		const cs = Math.floor((ms % 1000) / 10);
		return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
	}
	async function kcFetchJSON<T>(url: string): Promise<T> {
		const res = await kcFetch(url);
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}

	// -------- Data loading --------
	async function loadAllRaw() {
		const bundle = await kcFetchJSON<BundleResponse>('/api/bundle');

		drivers = bundle.drivers;
		stages = bundle.stages;
		starts = bundle.start_events;
		finishes = bundle.finish_events;

		if (stages.length && activeStageId == null) {
			activeStageId = stages[stages.length - 1].id;
		}
	}

	// -------- Core calculations --------
	function buildStageRows(stageId: number): StageRow[] {
		const tagToDriver: Record<string | number, Driver> = {};
		for (const d of drivers) if (d.rfid_tag != null) tagToDriver[d.rfid_tag] = d;
		const driverStart: Record<number, StartEvent> = {};
		for (const se of starts) if (se.stage_id === stageId) driverStart[se.driver_id] = se;

		// Use only the first (earliest) finish per driver to avoid duplicates
		const firstFinishByDriver: Record<number, number> = {};
		for (const f of finishes.filter((x) => x.stage_id === stageId)) {
			const drv = tagToDriver[f.tag];
			if (!drv) continue;
			if (firstFinishByDriver[drv.id] === undefined || f.ts < firstFinishByDriver[drv.id]) {
				firstFinishByDriver[drv.id] = f.ts;
			}
		}

		const rows: StageRow[] = [];
		for (const [driverId, finishTs] of Object.entries(firstFinishByDriver)) {
			const drv = drivers.find((d) => d.id === Number(driverId));
			if (!drv) continue;
			const se = driverStart[drv.id];
			if (!se) continue;
			const stage_ms = finishTs - se.ts;
			if (stage_ms < 0) continue;
			rows.push({
				driver_id: drv.id,
				driver_name: drv.name,
				class_name: drv.class_name,
				stage_ms,
				delta_p1: null,
				delta_prev: null,
				position: 0
			});
		}
		rows.sort((a, b) => a.stage_ms - b.stage_ms);
		assignPositionsAndDeltas(rows, (r) => r.stage_ms);
		return rows;
	}

	function buildRallyRows(): RallyRow[] {
		const stageIdToRows: Record<number, StageRow[]> = {};
		for (const s of stages) stageIdToRows[s.id] = buildStageRows(s.id);

		const totalByDriver: Record<
			number,
			{ total: number; finished: number; class_name: string; name: string }
		> = {};
		for (const d of drivers) {
			let sum = 0,
				finished = 0;
			for (const s of stages) {
				const hit = (stageIdToRows[s.id] ?? []).find((r) => r.driver_id === d.id);
				if (hit) {
					sum += hit.stage_ms;
					finished += 1;
				}
			}
			if (finished > 0)
				totalByDriver[d.id] = { total: sum, finished, class_name: d.class_name, name: d.name };
		}

		const rows: RallyRow[] = Object.entries(totalByDriver).map(
			([idStr, v]: [
				string,
				{ total: number; finished: number; class_name: string; name: string }
			]) => ({
				driver_id: Number(idStr),
				driver_name: v.name,
				class_name: v.class_name,
				total_ms: v.total,
				delta_p1: null,
				delta_prev: null,
				position: 0,
				finished_stages: v.finished
			})
		);
		rows.sort((a, b) => a.total_ms - b.total_ms);
		assignPositionsAndDeltas(rows, (r) => r.total_ms);
		return rows;
	}

	function assignPositionsAndDeltas<
		T extends { position: number; delta_p1: number | null; delta_prev: number | null }
	>(rows: T[], getTime: (r: T) => number) {
		let prev: number | null = null;
		const p1 = rows.length ? getTime(rows[0]) : null;
		rows.forEach((r, i) => {
			r.position = i + 1;
			const t = getTime(r);
			r.delta_p1 = p1 != null ? t - p1 : null;
			r.delta_prev = prev != null ? t - prev : null;
			prev = t;
		});
	}

	// -------- Refresh --------
	async function recomputeAll() {
		stageRows = activeStageId != null ? buildStageRows(activeStageId) : [];
		rallyRows = buildRallyRows();
	}

	let poller: number | null = null;

	onMount(async () => {
		await loadAllRaw();
		await recomputeAll();
		poller = window.setInterval(async () => {
			await loadAllRaw();
			await recomputeAll();
		}, 1000);
	});
	onDestroy(() => {
		if (poller) clearInterval(poller);
	});
</script>

<div class="w-full space-y-8 p-5">
	<!-- Rally leaderboard -->
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<Heading class="mb-4 text-2xl font-bold">Rally Leaderboard</Heading>
		<Table hoverable>
			<TableHead>
				<TableHeadCell>#</TableHeadCell>
				<TableHeadCell>Driver</TableHeadCell>
				<TableHeadCell>Class</TableHeadCell>
				<TableHeadCell>Total</TableHeadCell>
				<TableHeadCell>Δ P1</TableHeadCell>
				<TableHeadCell>Δ Prev</TableHeadCell>
				<TableHeadCell title="How many stages finished">✓ Stg</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each rallyRows as r (r.driver_id)}
					<TableBodyRow>
						<TableBodyCell class="font-semibold">{r.position}</TableBodyCell>
						<TableBodyCell>{r.driver_name}</TableBodyCell>
						<TableBodyCell class="opacity-80">{r.class_name}</TableBodyCell>
						<TableBodyCell class="font-mono">{formatMs(r.total_ms)}</TableBodyCell>
						<TableBodyCell class="font-mono"
							>{r.delta_p1 != null ? '+' + formatMs(r.delta_p1) : '—'}</TableBodyCell
						>
						<TableBodyCell class="font-mono"
							>{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}</TableBodyCell
						>
						<TableBodyCell class="text-center">{r.finished_stages}</TableBodyCell>
					</TableBodyRow>
				{/each}
				{#if !rallyRows.length}
					<TableBodyRow><TableBodyCell colspan={7}>No results yet.</TableBodyCell></TableBodyRow>
				{/if}
			</TableBody>
		</Table>
	</Card>

	<!-- Stage tabs + leaderboard -->
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<div class="mb-4 flex flex-wrap gap-2">
			{#each stages as s (s.id)}
				<Button
					size="sm"
					color={activeStageId === s.id ? 'blue' : 'light'}
					onclick={() => {
						activeStageId = s.id;
						stageRows = buildStageRows(s.id);
					}}
				>
					{s.name}
				</Button>
			{/each}
			{#if !stages.length}
				<span class="text-sm opacity-70">No stages yet.</span>
			{/if}
		</div>

		{#if activeStageId}
			<Table hoverable>
				<TableHead>
					<TableHeadCell>#</TableHeadCell>
					<TableHeadCell>Driver</TableHeadCell>
					<TableHeadCell>Class</TableHeadCell>
					<TableHeadCell>Stage Time</TableHeadCell>
					<TableHeadCell>Δ P1</TableHeadCell>
					<TableHeadCell>Δ Prev</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each stageRows as r (r.driver_id)}
						<TableBodyRow>
							<TableBodyCell class="font-semibold">{r.position}</TableBodyCell>
							<TableBodyCell>{r.driver_name}</TableBodyCell>
							<TableBodyCell class="opacity-80">{r.class_name}</TableBodyCell>
							<TableBodyCell class="font-mono">{formatMs(r.stage_ms)}</TableBodyCell>
							<TableBodyCell class="font-mono"
								>{r.delta_p1 != null ? '+' + formatMs(r.delta_p1) : '—'}</TableBodyCell
							>
							<TableBodyCell class="font-mono"
								>{r.delta_prev != null ? '+' + formatMs(r.delta_prev) : '—'}</TableBodyCell
							>
						</TableBodyRow>
					{/each}
					{#if !stageRows.length}
						<TableBodyRow
							><TableBodyCell colspan={6}>No stage results yet.</TableBodyCell></TableBodyRow
						>
					{/if}
				</TableBody>
			</Table>
		{/if}
	</Card>
</div>
