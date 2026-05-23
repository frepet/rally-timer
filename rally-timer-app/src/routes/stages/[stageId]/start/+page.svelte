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
	import {
		playBeep,
		primeAudio,
		getAudioCurrentTime,
		scheduleBeepAt,
		closeAudio
	} from '../../../../lib/beep';

	type Driver = { id: number; name: string; class_name?: string; tag: string };
	type Gate = { id: string; name: string | null; stage_id: number | null };

	let stageId = $state<number>(0);
	let stageName = $state<string>('');

	let drivers = $state<Driver[]>([]);
	let gates = $state<Gate[]>([]);
	let idx = $state(0);
	let running = $state(false);
	let paused = $state(false);
	let gapSeconds = $state(10);
	let startWholeClass = $state(false);
	let remainingMs = $state(0);
	const leds = $state([0, 0, 0, 0, 0]);
	let timer: ReturnType<typeof setInterval> | undefined;
	let gatePoller: ReturnType<typeof setInterval> | undefined;
	let eventSource: EventSource | null = null;

	// Wall-clock timing: remainingMs is derived from targetTime each tick,
	// so the countdown never drifts regardless of setInterval jitter.
	let targetTime: number | null = null;
	let pausedRemaining: number | null = null;
	let lastWhole = -1;

	// Beeps are scheduled via Web Audio API (sample-accurate) rather than
	// detected from the poll loop, so they are always evenly spaced.
	let pendingOscs: OscillatorNode[] = [];

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

	function scheduleCountdown(gapSec: number) {
		cancelBeeps();
		const t0 = getAudioCurrentTime();
		for (let i = 5; i >= 1; i--) {
			if (gapSec >= i) {
				pendingOscs.push(scheduleBeepAt(t0 + gapSec - i, 880, 0.35));
			}
		}
		pendingOscs.push(scheduleBeepAt(t0 + gapSec, 1000, 0.6, 0.6));
	}

	function createUtterance(text: string) {
		const utter = new SpeechSynthesisUtterance(text);
		const svVoice = speechSynthesis.getVoices().find((v) => v.lang === 'sv-SE');
		if (svVoice) utter.voice = svVoice;
		utter.rate = 1;
		utter.pitch = 1.0;
		return utter;
	}

	async function loadQueue() {
		stageId = Number($page.params.stageId);
		const [bundleRes, orderRes] = await Promise.all([
			kcFetch('/api/bundle'),
			kcFetch(`/api/stage/${stageId}/start-order`)
		]);
		if (!bundleRes.ok || !orderRes.ok) return;
		const bundle = (await bundleRes.json()) as BundleResponse;
		const ordered = (await orderRes.json()) as {
			id: number;
			name: string;
			rfid_tag: string;
			class_id: number;
			class_name: string;
		}[];
		const stage = bundle.stages.find((s) => s.id === stageId);
		stageName = stage?.name ?? `#${stageId}`;
		drivers = ordered.map((d) => ({
			id: d.id,
			name: d.name,
			tag: d.rfid_tag,
			class_name: d.class_name
		}));
		idx = 0;
	}

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	const hasGate = $derived(gates.some((g) => g.stage_id === stageId));
	const activeClass = $derived(drivers[idx]?.class_name ?? '');
	const remainingInClass = $derived(
		activeClass ? drivers.slice(idx).filter((d) => d.class_name === activeClass).length : 0
	);

	function setLED(step: number) {
		if (step < 0 || step > 5) {
			leds.fill(3);
			return;
		}
		if (step === 0) {
			leds.fill(2);
			return;
		}
		leds[0] = step >= 1 ? 1 : 0;
		leds[1] = step >= 2 ? 1 : 0;
		leds[2] = step >= 3 ? 1 : 0;
		leds[3] = step >= 4 ? 1 : 0;
		leds[4] = step >= 5 ? 1 : 0;
	}

	async function launchCurrentDriver() {
		if (!drivers[idx]) return;
		const launchedClass = drivers[idx].class_name;
		let count = 1;
		if (startWholeClass) {
			while (idx + count < drivers.length && drivers[idx + count].class_name === launchedClass) {
				count++;
			}
		}
		const body =
			count > 1
				? { driver_ids: drivers.slice(idx, idx + count).map((d) => d.id) }
				: { driver_id: drivers[idx].id };
		await kcFetch(`/api/stage/${stageId}/start`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		idx += count;
		if (idx < drivers.length) {
			if (drivers[idx].class_name !== launchedClass) {
				paused = true;
				speechSynthesis.speak(
					createUtterance(t.speechClassDone(launchedClass ?? '', drivers[idx].class_name ?? ''))
				);
			} else {
				speechSynthesis.speak(createUtterance(t.speechNextDriver(drivers[idx].name)));
			}
		} else {
			speechSynthesis.speak(createUtterance(t.speechNoMoreDrivers));
		}
	}

	function tick() {
		if (!running || paused || targetTime === null) return;

		const now = Date.now();
		const remaining = targetTime - now;
		remainingMs = Math.max(0, remaining);

		const whole = Math.ceil(remaining / 1000);
		if (whole !== lastWhole) {
			lastWhole = whole;
			if (whole >= 1 && whole <= 5) {
				setLED(whole);
			}
		}

		if (remaining <= 0) {
			targetTime = null;
			setLED(0); // all green
			pendingOscs = []; // GO beep is now playing; release refs so cancelBeeps() can't cut it off

			launchCurrentDriver().then(() => {
				if (!running) return;
				if (idx < drivers.length) {
					// Brief green flash, then start next countdown
					setTimeout(() => {
						if (!running || paused) return;
						targetTime = Date.now() + gapSeconds * 1000;
						lastWhole = -1;
						setLED(6);
						scheduleCountdown(gapSeconds);
					}, 1500);
				} else {
					stop();
					setTimeout(() => setLED(6), 2000);
				}
			});
		}
	}

	async function start() {
		if (!drivers.length || running) return;
		// Speak synchronously within the user gesture — Chrome blocks speech synthesis
		// if the first call comes after an await.
		if (startWholeClass && drivers[idx]) {
			speechSynthesis.speak(
				createUtterance(t.speechNextClass(drivers[idx].class_name ?? '', remainingInClass))
			);
		} else {
			speechSynthesis.speak(createUtterance(t.speechNextDriver(drivers[idx].name)));
		}
		await primeAudio();
		running = true;
		paused = false;
		targetTime = Date.now() + gapSeconds * 1000;
		lastWhole = -1;
		setLED(6);
		if (timer) clearInterval(timer);
		timer = setInterval(tick, 50);
		scheduleCountdown(gapSeconds);
	}

	function pause() {
		if (running && !paused && targetTime !== null) {
			pausedRemaining = Math.max(0, targetTime - Date.now());
			targetTime = null;
			paused = true;
			cancelBeeps();
		}
	}

	function resume() {
		if (running && paused && pausedRemaining !== null) {
			const remaining = pausedRemaining;
			targetTime = Date.now() + remaining;
			pausedRemaining = null;
			lastWhole = -1;
			paused = false;
			scheduleCountdown(remaining / 1000);
		}
	}

	function restart() {
		cancelBeeps();
		running = false;
		paused = false;
		idx = 0;
		targetTime = null;
		pausedRemaining = null;
		remainingMs = 0;
		lastWhole = -1;
		setLED(6);
		if (timer) clearInterval(timer);
		timer = undefined;
		speechSynthesis.cancel();
	}

	function stop() {
		cancelBeeps();
		running = false;
		paused = false;
		targetTime = null;
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	onMount(() => {
		loadQueue();
		loadGates();
		gatePoller = setInterval(loadGates, 5000);

		eventSource = new EventSource('/api/gate-events/stream');
		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data) as { gate_id?: string };
				if (!data.gate_id) return;
				const isForThisStage = gates.some(
					(g) => g.id === data.gate_id && g.stage_id === stageId
				);
				if (isForThisStage) playBeep(1200, 0.4, 0.4);
			} catch {
				/* ignore */
			}
		};
	});

	onDestroy(() => {
		if (gatePoller) clearInterval(gatePoller);
		if (timer) clearInterval(timer);
		if (eventSource) eventSource.close();
		closeAudio();
	});
</script>

<div class="flex w-full flex-col gap-6 p-6">
	<!-- Current + Next two -->
	<Card class="flex w-full flex-col p-5">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<P class="text-xl font-semibold">{stageName}</P>
			{#if activeClass}
				<P class="text-xl font-semibold">
					{t.activeClassLabel} <span class="text-blue-600 dark:text-blue-400">{activeClass}</span>
					<span class="text-sm font-normal opacity-70">({remainingInClass} {t.remainingLabel})</span
					>
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
				{#if drivers[idx]}
					{drivers[idx].name} <br />
				{:else}
					{t.noMoreDrivers}
				{/if}
			</P>
			<P class="text-2xl tracking-wide italic">
				{#if drivers[idx]}
					{drivers[idx].class_name || ''}
				{/if}
			</P>
		</div>
	</Card>

	<!-- Queue preview -->
	<Card class="p-3">
		<div class="">
			<P class="text-sm opacity-70">{t.upNext}</P>
			<P class="text-xl">{drivers[idx + 1]?.name} — {drivers[idx + 1]?.class_name || ''}</P>
			<P class="text-lg opacity-80">
				{drivers[idx + 2]?.name} — {drivers[idx + 2]?.class_name || ''}
			</P>
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
				{#each drivers as driver, i (driver.id)}
					<TableBodyRow
						class={i < idx
							? 'line-through opacity-40'
							: i === idx
								? 'bg-amber-50 font-bold dark:bg-amber-900/30'
								: ''}
					>
						<TableBodyCell>{i + 1}</TableBodyCell>
						<TableBodyCell>{driver.name}</TableBodyCell>
						<TableBodyCell>{driver.class_name || ''}</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>

	<!-- Queue controls -->
	<Card class="p-3">
		<div class="flex flex-col items-center justify-between">
			<div class="flex w-full flex-row items-center gap-2 p-2">
				<label for="gap" class="text-sm opacity-70"><P>{t.gapSecondsLabel}</P></label>
				<Input id="gap" type="number" min="1" class="w-20 rounded p-2" bind:value={gapSeconds} />
			</div>
			<div class="flex w-full flex-row items-center gap-2 p-2">
				<Toggle bind:checked={startWholeClass} disabled={running}>
					{t.startWholeClassLabel}
				</Toggle>
			</div>
			{#if !hasGate}
				<P class="px-2 text-sm text-yellow-600 dark:text-yellow-400">{t.noGateForStage}</P>
			{/if}
			<div class="flex w-full flex-wrap gap-2 p-2">
				<Button size="sm" onclick={start} disabled={running || !hasGate}>{t.startButton}</Button>
				<Button size="sm" onclick={pause} disabled={!running || paused}>{t.pauseButton}</Button>
				<Button size="sm" onclick={resume} disabled={!running || !paused}>{t.resumeButton}</Button>
				<Button size="sm" color="red" onclick={restart}>{t.restartButton}</Button>
			</div>
		</div>
	</Card>
</div>
