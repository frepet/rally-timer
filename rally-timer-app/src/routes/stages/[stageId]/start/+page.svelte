<script lang="ts">
	import { Card, Button, Input, P, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { kcFetch } from '../../../../lib/kcFetch';
	import type { BundleResponse } from '../../../../lib/types';

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
	let remainingMs = $state(0);
	const leds = $state([0, 0, 0, 0, 0]);
	let timer: ReturnType<typeof setInterval> | undefined;
	let gatePoller: ReturnType<typeof setInterval> | undefined;

	let utters = new Map<string, SpeechSynthesisUtterance>();

	function createUtterance(text: string) {
		let utter = new SpeechSynthesisUtterance(text);
		let enGbVoice = speechSynthesis.getVoices().find((voice) => voice.lang === 'en-GB');
		if (enGbVoice) utter.voice = enGbVoice;
		utter.rate = 1;
		utter.pitch = 1.0;
		return utter;
	}

	async function loadQueue() {
		stageId = Number($page.params.stageId);

		const res = await kcFetch('/api/bundle');
		if (!res.ok) return;

		const bundle = (await res.json()) as BundleResponse;

		drivers = bundle.drivers.map((d) => ({
			id: d.id,
			name: d.name,
			tag: d.rfid_tag,
			class_name: d.class_name
		}));
		const stage = bundle.stages.find((s) => s.id === stageId);
		stageName = stage?.name ?? `#${stageId}`;
		idx = 0;
	}

	async function loadGates() {
		const res = await kcFetch('/api/gate');
		if (!res.ok) return;
		gates = await res.json();
	}

	const hasGate = $derived(gates.some((g) => g.stage_id === stageId));

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
		speechSynthesis.cancel();
		speechSynthesis.speak(utters.get('go')!);
		await kcFetch(`/api/stage/${stageId}/start`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ driver_id: drivers[idx].id })
		});
		idx += 1;
		if (idx < drivers.length) {
			speechSynthesis.speak(createUtterance('Next driver:' + drivers[idx].name));
		} else {
			speechSynthesis.speak(createUtterance('No more drivers'));
		}
	}

	function tick() {
		if (!running || paused) return;
		const prevWhole = Math.ceil(remainingMs / 1000);
		remainingMs = Math.max(0, remainingMs - 100);
		const whole = Math.ceil(remainingMs / 1000);
		if (whole !== prevWhole) {
			if (whole < 6 && whole > 0) {
				setLED(whole);
				speechSynthesis.cancel();
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
		if (timer) clearInterval(timer);
		timer = setInterval(tick, 100);
		speechSynthesis.speak(createUtterance('Next driver:' + drivers[idx].name));
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
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	function stop() {
		running = false;
		paused = false;
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	onMount(() => {
		utters = new Map([
			['1', createUtterance('1')],
			['2', createUtterance('2')],
			['3', createUtterance('3')],
			['4', createUtterance('4')],
			['5', createUtterance('5')],
			['go', createUtterance('go')]
		]);
		loadQueue();
		loadGates();
		gatePoller = setInterval(loadGates, 5000);
	});

	onDestroy(() => {
		if (gatePoller) clearInterval(gatePoller);
	});
</script>

<div class="flex w-full flex-col gap-6 p-6">
	<!-- Current + Next two -->
	<Card class="flex w-full flex-col p-5">
		<div>
			<P class="text-xl font-semibold">{stageName}</P>
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

	<!-- Start order list -->
	<Card class="p-3">
		<P class="mb-2 text-sm font-semibold opacity-70">Start order</P>
		<Table striped={true}>
			<TableHead>
				<TableHeadCell class="w-12">#</TableHeadCell>
				<TableHeadCell>Driver</TableHeadCell>
				<TableHeadCell>Class</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each drivers as driver, i (driver.id)}
					<TableBodyRow
						class={i < idx
							? 'opacity-40 line-through'
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
				<label for="gap" class="text-sm opacity-70"><P>Gap (s)</P></label>
				<Input id="gap" type="number" min="1" class="w-20 rounded p-2" bind:value={gapSeconds} />
			</div>
			{#if !hasGate}
				<P class="px-2 text-sm text-yellow-600 dark:text-yellow-400"
					>No gate assigned to this stage.</P
				>
			{/if}
			<div class="flex w-full flex-wrap gap-2 p-2">
				<Button size="sm" onclick={start} disabled={running || !hasGate}>Start</Button>
				<Button size="sm" onclick={pause} disabled={!running || paused}>Pause</Button>
				<Button size="sm" onclick={resume} disabled={!running || !paused}>Resume</Button>
				<Button size="sm" color="red" onclick={restart}>Restart</Button>
			</div>
		</div>
	</Card>
</div>
