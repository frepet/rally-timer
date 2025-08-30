<script lang="ts">
	import { Card, Button, Input } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	type Driver = { id: number; name: string; class_name?: string; tag: string };

	let rallyId = $state<number>(0);
	let stageId = $state<number>(0);
	let drivers = $state<Driver[]>([]);
	let idx = $state(0); // current driver index
	let running = $state(false);
	let paused = $state(false);
	let gapSeconds = $state(10); // time between launches
	let remainingMs = $state(0);

	// LEDs 3-2-1-0
	const leds = $state([false, false, false, false]);
	let timer: ReturnType<typeof setInterval> | undefined;

	// Audio beeps
	let ac: AudioContext | undefined;
	function beep(freq: number, ms: number) {
		if (!ac) ac = new (window.AudioContext || (window as any).webkitAudioContext)();
		const o = ac.createOscillator();
		const g = ac.createGain();
		o.connect(g);
		g.connect(ac.destination);
		o.frequency.value = freq;
		o.type = 'sine';
		const now = ac.currentTime;
		g.gain.setValueAtTime(0.0001, now);
		g.gain.linearRampToValueAtTime(0.2, now + 0.01);
		g.gain.linearRampToValueAtTime(0.0001, now + ms / 1000);
		o.start(now);
		o.stop(now + ms / 1000 + 0.02);
	}

	async function loadQueue() {
		rallyId = Number($page.params.rallyId);
		stageId = Number($page.params.stageId);

		const res = await fetch(`/api/rally/${rallyId}/drivers`);
		drivers = res.ok ? await res.json() : [];
		idx = 0;
	}

	function setLED(step: number) {
		leds[0] = step >= 1;
		leds[1] = step >= 2;
		leds[2] = step >= 3;
		leds[3] = step >= 4;
	}

	async function launchCurrentDriver() {
		if (!drivers[idx]) return;
		// Long high beep on GO
		beep(1000, 600);
		await fetch(`/api/stage/${stageId}/start`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ driver_id: drivers[idx].id })
		});
		idx += 1;
	}

	function tick() {
		if (!running || paused) return;

		const prevWhole = Math.ceil(remainingMs / 1000);
		remainingMs = Math.max(0, remainingMs - 100);

		const whole = Math.ceil(remainingMs / 1000);

		// Beep on 3,2,1; Go at 0
		if (whole !== prevWhole) {
			if (whole === 3 || whole === 2 || whole === 1) {
				setLED(4 - whole); // light up 1..3
				beep(440, 150);
			} else if (whole === 0) {
				setLED(4);
				launchCurrentDriver().then(() => {
					if (idx >= drivers.length) {
						stop();
						return;
					}
					remainingMs = gapSeconds * 1000;
					setLED(0);
				});
			}
		}
	}

	function start() {
		if (!drivers.length) return;
		running = true;
		paused = false;
		remainingMs = gapSeconds * 1000;
		setLED(0);
		timer && clearInterval(timer);
		timer = setInterval(tick, 100); // 10Hz for smooth countdown
	}

	function pause() {
		if (running) paused = true;
	}
	function resume() {
		if (running) paused = false;
	}
	function restart() {
		running = false;
		paused = false;
		idx = 0;
		remainingMs = 0;
		setLED(0);
		timer && clearInterval(timer);
		timer = undefined;
	}

	function stop() {
		running = false;
		paused = false;
		timer && clearInterval(timer);
		timer = undefined;
	}

	onMount(loadQueue);
</script>

<div class="flex w-full flex-col gap-6 p-6 text-white">
	<!-- Current + Next two -->
	<Card class="flex w-full flex-col p-5">
		<div>
			<div class="text-sm opacity-70">Stage</div>
			<div class="text-xl font-semibold">#{stageId}</div>
		</div>
		<div class="flex items-center">
			<!-- LEDs -->
			<div class="flex flex-1 justify-center gap-3">
				{#each [0, 1, 2, 3] as i}
					<div
						class="h-8 w-8 rounded-full border"
						style={`background:${leds[i] ? (i < 3 ? '#16a34a' : '#dc2626') : 'transparent'}; box-shadow:${leds[i] ? '0 0 12px rgba(34,197,94,0.7)' : 'none'}`}
					></div>
				{/each}
			</div>

			<!-- Countdown -->
			<div class="flex flex-row-reverse text-6xl">
				{Math.ceil(remainingMs / 1000)}
			</div>
		</div>

		<!-- Current -->
		<div class="md:col-span-2">
			<div class="text-4xl font-extrabold tracking-wide">
				{#if drivers[idx]}
					{drivers[idx].name} <br />
				{:else}
					No more drivers
				{/if}
			</div>
			<div class="text-2xl tracking-wide italic">
				{#if drivers[idx]}
					{drivers[idx].class_name || ''}
				{/if}
			</div>
		</div>
	</Card>

	<!-- Queue preview -->
	<Card class="p-3">
		<div class="">
			<div class="text-sm opacity-70">Next up</div>
			<div class="text-xl">{drivers[idx + 1]?.name} — {drivers[idx + 1]?.class_name || ''}</div>
			<div class="text-lg opacity-80">
				{drivers[idx + 2]?.name} — {drivers[idx + 2]?.class_name || ''}
			</div>
		</div>
	</Card>

	<!-- Queue controls -->
	<Card class="p-3">
		<div class="flex flex-col items-center justify-between">
			<div class="flex w-full flex-row items-center gap-2 p-2">
				<label for="gap" class="text-sm opacity-70">Gap (s)</label>
				<Input id="gap" type="number" min="1" class="w-20 rounded p-2" bind:value={gapSeconds} />
			</div>
			<div class="flex w-full gap-2 p-2">
				<Button size="sm" onclick={start} disabled={running}>Start</Button>
				<Button size="sm" onclick={pause} disabled={!running || paused}>Pause</Button>
				<Button size="sm" onclick={resume} disabled={!running || !paused}>Resume</Button>
				<Button size="sm" color="red" onclick={restart}>Restart</Button>
			</div>
		</div>
	</Card>
</div>
