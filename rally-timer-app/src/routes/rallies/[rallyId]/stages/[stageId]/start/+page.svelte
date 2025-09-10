<script lang="ts">
	import { Card, Button, Input, P } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { kcFetch } from '../../../../../../lib/kcFetch';

	type Driver = { id: number; name: string; class_name?: string; tag: string };
	type Rally = { id: number; name: string };
	type Stage = { id: number; name: string };

	let rallyId = $state<number>(0);
	let stageId = $state<number>(0);

	let rally: Rally | null = $state(null);
	let stages: Stage[] = $state([]);
	let stage: Stage | null = $state(null);

	let drivers = $state<Driver[]>([]);
	let idx = $state(0);
	let running = $state(false);
	let paused = $state(false);
	let gapSeconds = $state(10);
	let remainingMs = $state(0);
	const leds = $state([0, 0, 0, 0, 0]);
	let timer: ReturnType<typeof setInterval> | undefined;

	let utters = new Map<string, SpeechSynthesisUtterance>([
		['1', createUtterance('1')],
		['2', createUtterance('2')],
		['3', createUtterance('3')],
		['4', createUtterance('4')],
		['5', createUtterance('5')],
		['go', createUtterance('go')]
	]);

	function createUtterance(text: string) {
		let utter = new SpeechSynthesisUtterance(text);
		utter.lang = 'en-GB';
		utter.rate = 1;
		utter.pitch = 1.4;
		return utter;
	}

	async function loadQueue() {
		rallyId = Number($page.params.rallyId);
		stageId = Number($page.params.stageId);

		const res = await kcFetch(`/api/rally/${rallyId}/bundle`);
		if (!res.ok) return;

		const bundle = (await res.json()) as {
			rally: Rally;
			drivers: Driver[];
			stages: Stage[];
		};

		rally = bundle.rally;
		stages = bundle.stages;
		stage = stages.find((s) => s.id === stageId) ?? null;
		drivers = bundle.drivers;

		idx = 0;
	}

	function setLED(step: number) {
		if (step < 0 || step > 5) {
			leds.fill(3);
			return;
		}
		if (step == 0) {
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
		speechSynthesis.speak(utters.get('go')!);
		await kcFetch(`/api/stage/${stageId}/start`, {
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

		// Speak on 5,4,3,2,1; Go at 0
		if (whole !== prevWhole) {
			if (whole < 6 && whole > 0) {
				setLED(whole);
				speechSynthesis.speak(utters.get(whole.toString())!);
			} else if (whole === 0) {
				setLED(whole);
				launchCurrentDriver().then(() => {
					if (idx >= drivers.length) {
						stop();
						setTimeout(() => {
							setLED(6);
						}, 2000);
						return;
					}
					remainingMs = gapSeconds * 1000;
					setTimeout(() => {
						setLED(6);
					}, 2000);
				});
			}
		}
	}

	function start() {
		if (!drivers.length) return;
		running = true;
		paused = false;
		remainingMs = gapSeconds * 1000;
		setLED(6);
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
		setLED(6);
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

<div class="flex w-full flex-col gap-6 p-6">
	<!-- Current + Next two -->
	<Card class="flex w-full flex-col p-5">
		<div>
			<P class="text-sm text-xl opacity-70">{rally?.name || 'Rally'}</P>
			<P class="text-xl font-semibold">{stage?.name || `#${stageId}`}</P>
		</div>
		<div class="flex flex-wrap items-center">
			<!-- LEDs -->
			<div class="flex flex-1 justify-center gap-3">
				{#each [4, 3, 2, 1, 0] as i}
					<div
						class="h-8 w-8 rounded-full border"
						style={`background:${
							leds[i] === 2
								? '#16a34a' // green-600
								: leds[i] === 1
									? '#f59e0b' // amber-500
									: 'transparent'
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
					No more drivers
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
			<P class="text-sm opacity-70">Next up</P>
			<P class="text-xl">{drivers[idx + 1]?.name} — {drivers[idx + 1]?.class_name || ''}</P>
			<P class="text-lg opacity-80">
				{drivers[idx + 2]?.name} — {drivers[idx + 2]?.class_name || ''}
			</P>
		</div>
	</Card>

	<!-- Queue controls -->
	<Card class="p-3">
		<div class="flex flex-col items-center justify-between">
			<div class="flex w-full flex-row items-center gap-2 p-2">
				<label for="gap" class="text-sm opacity-70"><P>Gap (s)</P></label>
				<Input id="gap" type="number" min="1" class="w-20 rounded p-2" bind:value={gapSeconds} />
			</div>
			<div class="flex w-full flex-wrap gap-2 p-2">
				<Button size="sm" onclick={start} disabled={running}>Start</Button>
				<Button size="sm" onclick={pause} disabled={!running || paused}>Pause</Button>
				<Button size="sm" onclick={resume} disabled={!running || !paused}>Resume</Button>
				<Button size="sm" color="red" onclick={restart}>Restart</Button>
			</div>
		</div>
	</Card>
</div>
