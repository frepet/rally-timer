<script lang="ts">
	import {
		Card,
		Button,
		Input,
		P,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Toggle
	} from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../../../../lib/kcFetch';
	import type { BundleResponse } from '../../../../lib/types';
	import { t } from '../../../../lib/stores/locale.svelte';
	import { auth } from '../../../../lib/stores/auth.svelte';
	import {
		primeAudio,
		getAudioCurrentTime,
		scheduleBeepAt,
		closeAudio
	} from '../../../../lib/beep';

	type ScheduledStart = { driver_id: number; ts_ms: number; name: string; class_name: string };
	type RemainingDriver = { driver_id: number; name: string; class_name: string };
	type Gate = { id: string; name: string | null; stage_id: number | null };

	let stageId = $state<number>(0);
	let stageName = $state<string>('');

	// Authoritative sequence from the server. The client never writes start
	// events during the countdown — it only renders this schedule against the
	// (clock-corrected) current time and drives its own beeps/speech.
	let schedule = $state<ScheduledStart[]>([]);
	let remaining = $state<RemainingDriver[]>([]);
	let gates = $state<Gate[]>([]);

	// server_now - client_now, so corrected time agrees across every unit.
	let clockOffsetMs = 0;
	let nowMs = $state(Date.now());

	let soundEnabled = $state(false);
	let gapSeconds = $state(10);
	let leadInSeconds = $state(10);
	let startWholeClass = $state(false);

	const leds = $state([0, 0, 0, 0, 0]);
	let tickTimer: ReturnType<typeof setInterval> | undefined;
	let gatePoller: ReturnType<typeof setInterval> | undefined;
	let flowSource: EventSource | undefined;

	// Beeps are scheduled via Web Audio (sample-accurate). `beepArmedTs` tracks
	// which start slot we have already scheduled beeps for so the tick loop does
	// not reschedule every frame. `spokenTs` does the same for speech.
	let beepArmedTs: number | null = null;
	let spokenTs: number | null = null;
	let announcedNoMore = false;
	let pendingOscs: OscillatorNode[] = [];

	const correctedNow = () => Date.now() + clockOffsetMs;

	const future = $derived(schedule.filter((s) => s.ts_ms > nowMs));
	const nextEntry = $derived(future[0] ?? null);
	const remainingMs = $derived(nextEntry ? Math.max(0, nextEntry.ts_ms - nowMs) : 0);
	const hasGate = $derived(gates.some((g) => g.stage_id === stageId));

	function cancelBeeps() {
		for (const osc of pendingOscs) {
			try {
				osc.stop(0);
			} catch {
				/* already stopped */
			}
		}
		pendingOscs = [];
	}

	// Schedule the 5..1 countdown + GO beep so the GO lands exactly at `tsMs`
	// (server clock). Uses the audio clock offset by the time remaining.
	function scheduleCountdownTo(tsMs: number) {
		const leadSec = (tsMs - correctedNow()) / 1000;
		if (leadSec <= 0) return;
		const t0 = getAudioCurrentTime();
		for (let i = 5; i >= 1; i--) {
			if (leadSec >= i) pendingOscs.push(scheduleBeepAt(t0 + leadSec - i, 880, 0.35));
		}
		pendingOscs.push(scheduleBeepAt(t0 + leadSec, 1000, 0.6, 0.6));
	}

	function createUtterance(text: string) {
		const utter = new SpeechSynthesisUtterance(text);
		const svVoice = speechSynthesis.getVoices().find((v) => v.lang === 'sv-SE');
		if (svVoice) utter.voice = svVoice;
		utter.rate = 1;
		utter.pitch = 1.0;
		return utter;
	}

	function speak(text: string) {
		if (!soundEnabled) return;
		speechSynthesis.speak(createUtterance(text));
	}

	function speakNext(group: ScheduledStart[]) {
		if (group.length > 1) {
			speak(t.speechNextClass(group[0].class_name ?? '', group.length));
		} else if (group.length === 1) {
			speak(t.speechNextDriver(group[0].name));
		}
	}

	function setLED(step: number) {
		if (step === 0) {
			leds.fill(2); // all green — GO
			return;
		}
		if (step < 1 || step > 5) {
			leds.fill(0); // off / idle
			return;
		}
		leds[0] = step >= 1 ? 1 : 0;
		leds[1] = step >= 2 ? 1 : 0;
		leds[2] = step >= 3 ? 1 : 0;
		leds[3] = step >= 4 ? 1 : 0;
		leds[4] = step >= 5 ? 1 : 0;
	}

	// Arm beeps/speech for the imminent start and update the LED bar. Runs every
	// tick but is idempotent: it only (re)schedules when the target slot changes.
	function evaluate() {
		nowMs = correctedNow();
		const fut = schedule.filter((s) => s.ts_ms > nowMs);
		const next = fut[0] ?? null;

		if (next) {
			announcedNoMore = false;
			if (beepArmedTs !== next.ts_ms) {
				pendingOscs = []; // drop refs to already-played beeps from the previous slot
				scheduleCountdownTo(next.ts_ms);
				beepArmedTs = next.ts_ms;
			}
			if (spokenTs !== next.ts_ms) {
				speakNext(fut.filter((s) => s.ts_ms === next.ts_ms));
				spokenTs = next.ts_ms;
			}
		} else {
			beepArmedTs = null;
			if (!announcedNoMore && spokenTs !== null && remaining.length === 0) {
				speak(t.speechNoMoreDrivers);
				announcedNoMore = true;
			}
		}

		// LED bar: brief green flash right after each start (GO), otherwise the
		// amber countdown to the next start.
		const lastStartedTs = schedule.reduce<number | null>(
			(max, s) => (s.ts_ms <= nowMs && (max === null || s.ts_ms > max) ? s.ts_ms : max),
			null
		);
		if (lastStartedTs !== null && nowMs - lastStartedTs < 1500) {
			setLED(0);
		} else if (next) {
			const whole = Math.ceil((next.ts_ms - nowMs) / 1000);
			setLED(whole > 5 ? 6 : whole);
		} else {
			setLED(6);
		}
	}

	async function loadSchedule() {
		const res = await kcFetch(`/api/stage/${stageId}/schedule`);
		if (!res.ok) return;
		const data = (await res.json()) as {
			server_now_ms: number;
			scheduled: ScheduledStart[];
			remaining: RemainingDriver[];
		};
		clockOffsetMs = data.server_now_ms - Date.now();
		schedule = data.scheduled;
		remaining = data.remaining;
		// Re-arm beeps against the (possibly new) schedule and fresh clock offset.
		// Speech only re-fires if the imminent slot's timestamp actually changed.
		cancelBeeps();
		beepArmedTs = null;
		evaluate();
	}

	async function loadMeta() {
		const bundleRes = await kcFetch('/api/bundle');
		if (!bundleRes.ok) return;
		const bundle = (await bundleRes.json()) as BundleResponse;
		stageName = bundle.stages.find((s) => s.id === stageId)?.name ?? `#${stageId}`;
	}

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	function connectFlow() {
		flowSource = new EventSource(`/api/stage/${stageId}/flow/stream`);
		flowSource.onopen = () => {
			loadSchedule();
		};
		flowSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data) as { action: 'start' | 'stop' };
				if (data.action === 'start') speak(t.speechStageStarted);
				else if (data.action === 'stop') speak(t.speechStageStopped);
			} catch {
				/* ignore malformed payload */
			}
			loadSchedule();
		};
	}

	async function enableSound() {
		await primeAudio();
		// Warm up speech synthesis inside the user gesture so later utterances
		// (driven by the schedule, not a click) are allowed to play.
		speechSynthesis.speak(createUtterance(''));
		soundEnabled = true;
		beepArmedTs = null;
		spokenTs = null;
		evaluate();
	}

	async function pressStart() {
		await kcFetch(`/api/stage/${stageId}/start`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				gap_seconds: gapSeconds,
				lead_in_seconds: leadInSeconds,
				whole_class: startWholeClass
			})
		});
		// The 'start' flow event refreshes every connected unit, including this one.
	}

	async function pressStop() {
		cancelBeeps();
		await kcFetch(`/api/stage/${stageId}/stop`, { method: 'POST' });
	}

	onMount(() => {
		stageId = Number($page.params.stageId);
		loadMeta();
		loadSchedule();
		loadGates();
		connectFlow();
		gatePoller = setInterval(loadGates, 5000);
		tickTimer = setInterval(evaluate, 100);
	});

	onDestroy(() => {
		if (gatePoller) clearInterval(gatePoller);
		if (tickTimer) clearInterval(tickTimer);
		flowSource?.close();
		cancelBeeps();
		closeAudio();
	});
</script>

<div class="flex w-full flex-col gap-6 p-6">
	<!-- Current + countdown -->
	<Card class="flex w-full flex-col p-5">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<P class="text-xl font-semibold">{stageName}</P>
			{#if nextEntry}
				<P class="text-xl font-semibold">
					{t.activeClassLabel}
					<span class="text-blue-600 dark:text-blue-400">{nextEntry.class_name}</span>
				</P>
			{/if}
		</div>
		<div class="flex flex-wrap items-center">
			<!-- LEDs -->
			<div class="flex flex-1 justify-center gap-3">
				{#each [4, 3, 2, 1, 0] as i (i)}
					<div
						class="h-8 w-8 rounded-full border"
						style={`background:${
							leds[i] === 2 ? '#16a34a' : leds[i] === 1 ? '#f59e0b' : 'transparent'
						}; box-shadow:${
							leds[i] === 2
								? '0 0 12px rgba(22,163,74,0.85)'
								: leds[i] === 1
									? '0 0 12px rgba(245,158,11,0.9)'
									: 'none'
						};transition: background 120ms ease, box-shadow 120ms ease;`}
					></div>
				{/each}
			</div>

			<!-- Countdown -->
			<P class="flex flex-row-reverse text-6xl">
				{Math.ceil(remainingMs / 1000)}
			</P>
		</div>

		<!-- Current -->
		<div class="md:col-span-2">
			<P class="text-4xl font-extrabold tracking-wide">
				{#if nextEntry}
					{nextEntry.name} <br />
				{:else if remaining.length === 0}
					{t.noMoreDrivers}
				{:else}
					—
				{/if}
			</P>
			<P class="text-2xl tracking-wide italic">
				{#if nextEntry}
					{nextEntry.class_name || ''}
				{/if}
			</P>
		</div>
	</Card>

	<!-- Queue preview -->
	<Card class="p-3">
		<div class="">
			<P class="text-sm opacity-70">{t.upNext}</P>
			<P class="text-xl">{future[1]?.name ?? ''} — {future[1]?.class_name ?? ''}</P>
			<P class="text-lg opacity-80">{future[2]?.name ?? ''} — {future[2]?.class_name ?? ''}</P>
		</div>
	</Card>

	<!-- Start order list -->
	<Card class="p-3">
		<P class="mb-2 text-sm font-semibold opacity-70">{t.startOrder}</P>
		<Table striped={true}>
			<TableHead>
				<TableHeadCell class="w-12">#</TableHeadCell>
				<TableHeadCell>{t.driverColumn}</TableHeadCell>
				<TableHeadCell>{t.classColumn}</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each schedule as entry, i (entry.driver_id)}
					<TableBodyRow
						class={entry.ts_ms <= nowMs
							? 'line-through opacity-40'
							: nextEntry && entry.ts_ms === nextEntry.ts_ms
								? 'bg-amber-50 font-bold dark:bg-amber-900/30'
								: ''}
					>
						<TableBodyCell>{i + 1}</TableBodyCell>
						<TableBodyCell>{entry.name}</TableBodyCell>
						<TableBodyCell>{entry.class_name || ''}</TableBodyCell>
					</TableBodyRow>
				{/each}
				{#each remaining as driver, i (driver.driver_id)}
					<TableBodyRow class="opacity-70">
						<TableBodyCell>{schedule.length + i + 1}</TableBodyCell>
						<TableBodyCell>{driver.name}</TableBodyCell>
						<TableBodyCell>{driver.class_name || ''}</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>

	<!-- Controls -->
	<Card class="p-3">
		<div class="flex flex-col items-center justify-between">
			{#if !soundEnabled}
				<div class="flex w-full flex-row items-center gap-2 p-2">
					<Button size="sm" color="alternative" onclick={enableSound}>
						{t.enableSoundButton}
					</Button>
				</div>
			{/if}
			{#if auth.isAdmin}
				<div class="flex w-full flex-row items-center gap-2 p-2">
					<label for="gap" class="text-sm opacity-70"><P>{t.gapSecondsLabel}</P></label>
					<Input id="gap" type="number" min="1" class="w-20 rounded p-2" bind:value={gapSeconds} />
				</div>
				<div class="flex w-full flex-row items-center gap-2 p-2">
					<Toggle bind:checked={startWholeClass}>
						{t.startWholeClassLabel}
					</Toggle>
				</div>
				{#if !hasGate}
					<P class="px-2 text-sm text-yellow-600 dark:text-yellow-400">{t.noGateForStage}</P>
				{/if}
				<div class="flex w-full flex-wrap gap-2 p-2">
					<Button size="sm" onclick={pressStart} disabled={!hasGate}>{t.startButton}</Button>
					<Button size="sm" color="red" onclick={pressStop}>{t.stopButton}</Button>
				</div>
			{/if}
		</div>
	</Card>
</div>
