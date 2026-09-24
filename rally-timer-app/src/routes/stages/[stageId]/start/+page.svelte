<script lang="ts">
	let { data } = $props();
	import { Button, Input, Toggle } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../../../../lib/kcFetch';
	import { classChipClass } from '../../../../lib/classColor';
	import type { BundleResponse } from '../../../../lib/types';
	import { t, getLocale } from '../../../../lib/stores/locale.svelte';
	import { auth } from '../../../../lib/stores/auth.svelte';
	import {
		primeAudio,
		playBeep,
		getAudioCurrentTime,
		scheduleBeepAt,
		closeAudio
	} from '../../../../lib/beep';

	type ScheduledStart = {
		driver_id: number;
		ts_ms: number;
		name: string;
		class_id: number;
		class_name: string;
	};
	type RemainingDriver = { driver_id: number; name: string; class_id: number; class_name: string };
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
	// Independent from the start-sequence sound: a confirmation chime when a car
	// passes this stage's (finish) gate. Decoupled from the countdown scheduler.
	let finishBeepEnabled = $state(false);
	const FINISH_DEBOUNCE_MS = 3000;
	const lastFinishBeepByTag: Record<string, number> = {};
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
	let announcedClassDone = false;
	let pendingOscs: OscillatorNode[] = [];

	const correctedNow = () => Date.now() + clockOffsetMs;

	const future = $derived(schedule.filter((s) => s.ts_ms > nowMs));
	const nextEntry = $derived(future[0] ?? null);
	const remainingMs = $derived(nextEntry ? Math.max(0, nextEntry.ts_ms - nowMs) : 0);
	const hasGate = $derived(gates.some((g) => g.stage_id === stageId));
	// The most recently started entry — used to name the class that just
	// finished when the queue empties but more classes are waiting.
	const lastStarted = $derived(
		schedule.reduce<ScheduledStart | null>(
			(best, s) => (s.ts_ms <= nowMs && (!best || s.ts_ms > best.ts_ms) ? s : best),
			null
		)
	);
	// True when the queue has moved on to a genuinely different class from the
	// one that most recently started — as opposed to `remaining` still holding
	// the tail of the same class because Stop cut it short before it finished.
	const nextIsNewClass = $derived(
		remaining.length > 0 && remaining[0].class_id !== lastStarted?.class_id
	);
	// True once a class has fully started and the next Start press is needed to
	// begin the next one (there are more drivers queued, but none scheduled).
	const classComplete = $derived(
		!nextEntry && schedule.length > 0 && remaining.length > 0 && nextIsNewClass
	);
	// How many drivers make up the next (not-yet-started) class specifically,
	// as opposed to `remaining.length` which spans every class still queued.
	const nextClassDriverCount = $derived(
		remaining.length === 0
			? 0
			: remaining.filter((d) => d.class_id === remaining[0].class_id).length
	);

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
		// Setting `lang` alone steers the engine's pronunciation even when no
		// exact-match voice is installed, so it must match the text's language.
		const lang = getLocale() === 'sv' ? 'sv-SE' : 'en-US';
		utter.lang = lang;
		const voices = speechSynthesis.getVoices();
		const voice =
			voices.find((v) => v.lang === lang) ??
			voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
		if (voice) utter.voice = voice;
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
			announcedClassDone = false;
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
			if (remaining.length > 0) {
				// This class's drivers have all been started; the admin must press
				// Start again to release the next class. If `remaining` still holds
				// the same class as `lastStarted` (e.g. Stop cut it short before it
				// finished), it's not actually done — stay quiet.
				if (!announcedClassDone && schedule.length > 0 && nextIsNewClass) {
					speak(t.speechClassDone(lastStarted?.class_name ?? '', remaining[0].class_name));
					announcedClassDone = true;
				}
			} else if (!announcedNoMore && spokenTs !== null) {
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
		const bundleRes = await kcFetch(`/api/bundle?event_id=${data.eventId}`);
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

	// Distinct descending two-tone so it can't be confused with the countdown
	// beeps (880 Hz) or the GO tone (1000 Hz). playBeep resumes the context, so
	// this works even if the start-sequence sound was never enabled.
	function playFinishChime() {
		playBeep(523, 0.12, 0.5);
		setTimeout(() => playBeep(392, 0.18, 0.5), 140);
	}

	async function toggleFinishBeep(enabled: boolean) {
		finishBeepEnabled = enabled;
		// Unlock audio inside this user gesture so later (event-driven) chimes play.
		if (enabled) await primeAudio();
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

	// Finish confirmation: while enabled, listen to the global gate-event stream
	// and chime only for passages on this stage's gate. The effect re-runs only
	// when the toggle flips; reads of `gates`/`stageId` happen inside the (async)
	// message handler, so they don't re-open the connection on every poll.
	$effect(() => {
		if (!finishBeepEnabled) return;
		const es = new EventSource('/api/gate-events/stream');
		es.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data) as { gate_id?: string; tag?: string };
				if (!data.gate_id) return;
				const isFinishGate = gates.some((g) => g.id === data.gate_id && g.stage_id === stageId);
				if (!isFinishGate) return;

				const tag = data.tag ?? '';
				const now = Date.now();
				if (now - (lastFinishBeepByTag[tag] ?? 0) < FINISH_DEBOUNCE_MS) return;
				lastFinishBeepByTag[tag] = now;
				playFinishChime();
			} catch {
				/* ignore malformed payload */
			}
		};
		return () => es.close();
	});
</script>

<div class="page grid items-start gap-6 space-y-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
	<div class="space-y-6">
		<!-- Current + countdown: always a dark timing board -->
		<section
			class="overflow-hidden rounded-xl bg-surface-900 text-white shadow-lg ring-1 ring-black/20 dark:ring-white/10"
		>
			<div
				class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3"
			>
				<h1 class="display text-2xl font-bold">{stageName}</h1>
				{#if nextEntry}
					<p class="text-sm text-surface-300">
						{t.activeClassLabel}
						<span class="chip ml-1 text-sm {classChipClass(nextEntry.class_name)}"
							>{nextEntry.class_name}</span
						>
					</p>
				{:else if classComplete}
					<p class="text-sm text-surface-300">
						{t.nextClassLabel}
						<span class="chip ml-1 text-sm {classChipClass(remaining[0].class_name)}"
							>{remaining[0].class_name}</span
						>
					</p>
				{/if}
			</div>
			<div class="grid gap-6 px-5 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
				<div class="min-w-0 space-y-5">
					<!-- LEDs -->
					<div class="flex gap-3 sm:gap-4">
						{#each [4, 3, 2, 1, 0] as i (i)}
							<div
								class="h-10 w-10 rounded-full border-2 border-white/20 sm:h-12 sm:w-12"
								style={`background:${
									leds[i] === 2 ? '#16a34a' : leds[i] === 1 ? '#f59e0b' : 'rgba(255,255,255,0.04)'
								}; box-shadow:${
									leds[i] === 2
										? '0 0 18px rgba(22,163,74,0.9)'
										: leds[i] === 1
											? '0 0 18px rgba(245,158,11,0.9)'
											: 'none'
								};transition: background 120ms ease, box-shadow 120ms ease;`}
							></div>
						{/each}
					</div>

					<!-- Current -->
					<div class="min-w-0">
						<p class="display text-4xl leading-tight font-bold break-words sm:text-5xl">
							{#if nextEntry}
								{nextEntry.name}
							{:else if classComplete}
								{t.classDoneWaitingForStart}
							{:else if remaining.length === 0}
								{t.noMoreDrivers}
							{:else}
								—
							{/if}
						</p>
						{#if nextEntry}
							<p class="mt-1 text-xl text-surface-300 italic">{nextEntry.class_name || ''}</p>
						{/if}
					</div>
				</div>

				<!-- Countdown -->
				<p
					class="time text-right text-8xl leading-none text-primary-500 tabular-nums sm:text-9xl"
					aria-live="polite"
				>
					{Math.ceil(remainingMs / 1000)}
				</p>
			</div>
		</section>

		<!-- Queue preview -->
		<section class="panel panel-body">
			<p class="eyebrow mb-2">{classComplete ? t.nextClassPreview : t.upNext}</p>
			{#if classComplete}
				<p class="text-xl font-semibold">
					{remaining[0]?.class_name ?? ''} — {nextClassDriverCount}
					{t.remainingLabel}
				</p>
			{:else}
				<p class="text-xl font-semibold">
					{future[1]?.name ?? ''}
					{#if future[1]?.class_name}<span class="chip ml-1 {classChipClass(future[1].class_name)}"
							>{future[1].class_name}</span
						>{/if}
				</p>
				<p class="mt-1 text-lg text-surface-500 dark:text-surface-400">
					{future[2]?.name ?? ''}
					{#if future[2]?.class_name}<span class="chip ml-1 {classChipClass(future[2].class_name)}"
							>{future[2].class_name}</span
						>{/if}
				</p>
			{/if}
		</section>
	</div>

	<div class="space-y-6">
		<!-- Controls -->
		<section class="panel panel-body space-y-4">
			{#if !soundEnabled}
				<Button size="sm" color="alternative" class="w-full" onclick={enableSound}>
					{t.enableSoundButton}
				</Button>
			{/if}
			<div class="space-y-1">
				<Toggle
					checked={finishBeepEnabled}
					onchange={(e) => toggleFinishBeep((e.currentTarget as HTMLInputElement).checked)}
				>
					{t.finishBeepLabel}
				</Toggle>
				<p class="text-xs text-surface-500 dark:text-surface-400">{t.finishBeepHint}</p>
			</div>
			{#if auth.isAdmin}
				<div class="flex items-center justify-between gap-3">
					<label for="gap" class="text-sm font-medium">{t.gapSecondsLabel}</label>
					<div class="w-24">
						<Input id="gap" type="number" min="1" size="sm" bind:value={gapSeconds} />
					</div>
				</div>
				<Toggle bind:checked={startWholeClass}>
					{t.startWholeClassLabel}
				</Toggle>
				{#if !hasGate}
					<p class="chip chip--warn w-full py-1.5 whitespace-normal normal-case">
						{t.noGateForStage}
					</p>
				{/if}
				<div class="grid grid-cols-2 gap-2 border-t border-surface-100 pt-4 dark:border-white/8">
					<Button onclick={pressStart} disabled={!hasGate}>{t.startButton}</Button>
					<Button color="red" onclick={pressStop}>{t.stopButton}</Button>
				</div>
			{/if}
		</section>

		<!-- Start order list -->
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<h2 class="panel-title text-lg">{t.startOrder}</h2>
			</div>
			<div class="max-h-[32rem] overflow-y-auto p-2">
				<table class="data-table">
					<thead>
						<tr>
							<th class="w-10">#</th>
							<th>{t.driverColumn}</th>
							<th>{t.classColumn}</th>
						</tr>
					</thead>
					<tbody>
						{#each schedule as entry, i (entry.driver_id)}
							<tr
								class={entry.ts_ms <= nowMs
									? 'line-through opacity-40'
									: nextEntry && entry.ts_ms === nextEntry.ts_ms
										? 'font-bold [&>td]:bg-amber-50 dark:[&>td]:bg-amber-500/15'
										: ''}
							>
								<td class="time">{i + 1}</td>
								<td>{entry.name}</td>
								<td>
									{#if entry.class_name}<span class="chip {classChipClass(entry.class_name)}"
											>{entry.class_name}</span
										>{/if}
								</td>
							</tr>
						{/each}
						{#each remaining as driver, i (driver.driver_id)}
							<tr class="opacity-70">
								<td class="time">{schedule.length + i + 1}</td>
								<td>{driver.name}</td>
								<td>
									{#if driver.class_name}<span class="chip {classChipClass(driver.class_name)}"
											>{driver.class_name}</span
										>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>
