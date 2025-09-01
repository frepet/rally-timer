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
		Heading,
		Select,
		Label
	} from 'flowbite-svelte';
	import { goto } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// -------- Types --------
	type Rally = { id: number; name: string };
	type Driver = {
		id: number;
		name: string;
		class_id: number;
		class_name: string;
		rfid_tag: string | number | null;
	};
	type Stage = { id: number; name: string };
	type StartEvent = { id: number; stage_id: number; driver_id: number; ts: number };
	type GateEvent = { id: number; stage_id: number; ts: number };
	type BlipEvent = { id: number; stage_id: number; ts: number; tag: string | number };

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
	let rallies = $state<Rally[]>(data.rallies ?? []);
	let selectedRallyId = $state<number | null>(data.rallyId ?? null);

	let rallyRows = $state<RallyRow[]>([]);
	let stages = $state<Stage[]>([]);
	let stageRows = $state<StageRow[]>([]);
	let activeStageId = $state<number | null>(null);

	// Raw caches
	let drivers: Driver[] = [];
	let starts: StartEvent[] = [];
	let gates: GateEvent[] = [];
	let blips: BlipEvent[] = [];

	// -------- Utils --------
	function formatMs(ms: number | null | undefined): string {
		if (ms == null) return '—';
		const sec = Math.floor(ms / 1000);
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		const cs = Math.floor((ms % 1000) / 10);
		return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
	}
	async function fetchJSON<T>(url: string): Promise<T> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}

	// -------- Data loading --------
	async function loadAllRaw() {
		if (!selectedRallyId) return;

		const bundle = await fetchJSON<{
			drivers: Driver[];
			stages: Stage[];
			start_events: StartEvent[];
			gate_events: GateEvent[];
			blip_events: BlipEvent[];
		}>(`/api/rally/${selectedRallyId}/bundle`);

		drivers = bundle.drivers;
		stages = bundle.stages;
		starts = bundle.start_events;
		gates = bundle.gate_events;
		blips = bundle.blip_events;

		// Default stage if needed
		if (stages.length && (activeStageId === null || !stages.some((s) => s.id === activeStageId))) {
			activeStageId = stages[0].id;
		}
	}

	// -------- Core calculations --------
	function pairGatesToBlipsForStage(stageId: number): Map<number, GateEvent> {
		const sgates = gates.filter((g) => g.stage_id === stageId).sort((a, b) => a.ts - b.ts);
		const sblips = blips.filter((b) => b.stage_id === stageId).sort((a, b) => a.ts - b.ts);
		const blipToGate = new Map<number, GateEvent>();
		const n = Math.min(sgates.length, sblips.length);
		for (let i = 0; i < n; i++) blipToGate.set(sblips[i].id, sgates[i]);
		return blipToGate;
	}

	function buildStageRows(stageId: number): StageRow[] {
		const blipToGate = pairGatesToBlipsForStage(stageId);
		const tagToDriver = new Map<string | number, Driver>();
		for (const d of drivers) if (d.rfid_tag != null) tagToDriver.set(d.rfid_tag, d);
		const driverStart = new Map<number, StartEvent>();
		for (const se of starts) if (se.stage_id === stageId) driverStart.set(se.driver_id, se);

		const rows: StageRow[] = [];
		for (const b of blips.filter((x) => x.stage_id === stageId)) {
			const drv = tagToDriver.get(b.tag);
			if (!drv) continue;
			const se = driverStart.get(drv.id);
			if (!se) continue;
			const ge = blipToGate.get(b.id);
			if (!ge) continue;
			const stage_ms = ge.ts - se.ts;
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
		const stageIdToRows = new Map<number, StageRow[]>();
		for (const s of stages) stageIdToRows.set(s.id, buildStageRows(s.id));

		const totalByDriver = new Map<
			number,
			{ total: number; finished: number; class_name: string; name: string }
		>();
		for (const d of drivers) {
			let sum = 0,
				finished = 0;
			for (const s of stages) {
				const hit = (stageIdToRows.get(s.id) ?? []).find((r) => r.driver_id === d.id);
				if (hit) {
					sum += hit.stage_ms;
					finished += 1;
				}
			}
			if (finished > 0)
				totalByDriver.set(d.id, { total: sum, finished, class_name: d.class_name, name: d.name });
		}

		const rows: RallyRow[] = Array.from(totalByDriver.entries()).map(([driver_id, v]) => ({
			driver_id,
			driver_name: v.name,
			class_name: v.class_name,
			total_ms: v.total,
			delta_p1: null,
			delta_prev: null,
			position: 0,
			finished_stages: v.finished
		}));
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
		if (!selectedRallyId && rallies.length) selectedRallyId = rallies[0].id;
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

	// When rally changes via selector: update URL (?r=) and reload
	async function onRallyChange(idStr: string) {
		const id = Number(idStr) || null;
		selectedRallyId = id;
		activeStageId = null; // reset stage tab
		// Push new URL to keep it shareable
		const qs = id ? `?r=${id}` : '';
		goto(`${location.pathname}${qs}`, { replaceState: false, noScroll: true });

		await loadAllRaw();
		await recomputeAll();
	}
</script>

<div class="w-full space-y-8 p-5">
	<!-- Rally selector -->
	<Card class="max-w-none p-4">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
			<div class="flex flex-1">
				<Label for="rally" class="m-3 block flex-2 flex-none text-sm font-medium"
					>Select Rally</Label
				>
				<Select
					id="rally"
					class="flex-none"
					value={selectedRallyId ?? ''}
					onchange={(e) => onRallyChange((e.target as HTMLSelectElement).value)}
				>
					<option value="" disabled selected={selectedRallyId === null}>— choose —</option>
					{#each rallies as r}
						<option value={r.id} selected={selectedRallyId === r.id}>{r.name}</option>
					{/each}
				</Select>
			</div>
		</div>
	</Card>

	{#if !selectedRallyId}
		<div class="p-5">No rally selected.</div>
	{:else}
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
					{#each rallyRows as r}
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
				{#each stages as s}
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
					<span class="text-sm opacity-70">No stages for this rally.</span>
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
						{#each stageRows as r}
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
	{/if}
</div>
