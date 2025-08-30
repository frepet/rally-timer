<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, Button, Select, Input } from 'flowbite-svelte';

	type Rally = { id: number; name: string };
	type Stage = { id: number; rally_id: number; name: string };

	let rallies = $state<Rally[]>([]);
	let stages = $state<Stage[]>([]);
	let rallyId = $state<number | null>(null);
	let stageId = $state<number | null>(null);

	// --- Blip capture state
	let captureEnabled = $state(true);
	let lastTag = $state('');
	let lastStatus = $state('');

	// --- Gate capture state
	let gateConnected = $state(false);
	let gateStatus = $state('');

	async function fetchJSON<T>(url: string): Promise<T> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	async function loadRallies() {
		rallies = await fetchJSON<Rally[]>('/api/rally');
	}
	async function loadStages(id: number) {
		stages = await fetchJSON<Stage[]>(`/api/rally/${id}/stages`);
	}

	async function onSelectRally() {
		if (rallyId == null) {
			stages = [];
			stageId = null;
			return;
		}
		await loadStages(rallyId);
		if (!stages.some((s) => s.id === stageId)) stageId = null;
	}

	// --- Blip capture (keyboard wedge)
	let buffer = '';
	let lastKeyTime = 0;
	const GAP_RESET_MS = 500;
	function isEditable(el: EventTarget | null): boolean {
		const e = el as HTMLElement | null;
		return (
			!!e &&
			(e.tagName?.toLowerCase() === 'input' ||
				e.tagName?.toLowerCase() === 'textarea' ||
				e.isContentEditable)
		);
	}
	async function submitBlip(tag: string) {
		if (!stageId) return;
		const res = await fetch('/api/blip', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: stageId, tag, source: 'keyboard-wedge' })
		});
		lastTag = tag;
		lastStatus = res.ok ? 'OK' : `HTTP ${res.status}`;
	}
	function handleKey(ev: KeyboardEvent) {
		if (!captureEnabled || isEditable(ev.target)) return;
		const now = performance.now();
		if (now - lastKeyTime > GAP_RESET_MS) buffer = '';
		lastKeyTime = now;
		if (ev.key === 'Enter' || ev.key === 'Tab') {
			ev.preventDefault();
			const tag = buffer.trim();
			buffer = '';
			if (tag) submitBlip(tag);
			return;
		}
		if (ev.key === 'Escape') {
			buffer = '';
			return;
		}
		if (ev.key.length === 1) buffer += ev.key;
	}
	onMount(async () => {
		window.addEventListener('keydown', handleKey);

		await loadRallies();
		const savedRally = localStorage.getItem('blip:lastRallyId');
		if (savedRally) {
			rallyId = Number(savedRally);
			await loadStages(rallyId);
		}
		const savedStage = localStorage.getItem('blip:lastStageId');
		if (savedStage) {
			stageId = Number(savedStage);
		}
	});

	// --- Gate capture (WebSerial)
	let port: SerialPort | null = null;
	let reader: ReadableStreamDefaultReader<string> | null = null;
	let baud = $state(115200);

	class LineBreakTransformer {
		private container = '';
		transform(chunk: string, controller: TransformStreamDefaultController<string>) {
			this.container += chunk;
			const lines = this.container.split(/\r?\n/);
			this.container = lines.pop() ?? '';
			for (const line of lines) controller.enqueue(line);
		}
		flush(controller: TransformStreamDefaultController<string>) {
			if (this.container) controller.enqueue(this.container);
		}
	}

	async function connectGate() {
		port = await navigator.serial.requestPort();
		await port.open({ baudRate: baud });

		const textDecoder = new TextDecoderStream();
		port.readable!.pipeTo(textDecoder.writable);
		reader = textDecoder.readable
			.pipeThrough(new TransformStream(new LineBreakTransformer()))
			.getReader();

		gateConnected = true;
		gateStatus = 'Connected';

		listenGate(reader);
	}

	async function disconnectGate() {
		gateConnected = false;
		try {
			await reader?.cancel();
		} catch {}
		try {
			await port?.close();
		} catch {}
		reader = null;
		port = null;
	}

	async function listenGate(reader: ReadableStreamDefaultReader<string>) {
		while (gateConnected) {
			const { value, done } = await reader.read();
			console.log(value);
			console.log(done);
			if (done) break;
			if (!value) continue;

			if (value.trim() === 'P') {
				gateStatus = `Pulse @ ${new Date().toLocaleTimeString()}`;
				if (stageId) {
					await fetch('/api/gate', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ stage_id: stageId, source: 'webserial' })
					});
				}
			}
		}
	}
</script>

<div class="w-full space-y-6 p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-4 text-xl font-bold">Select rally/stage</h5>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<label for="rallySel">Rally</label>
				<Select id="rallySel" bind:value={rallyId} onchange={onSelectRally}>
					<option value={null}>—</option>
					{#each rallies as r}<option value={r.id}>{r.name}</option>{/each}
				</Select>
			</div>
			<div>
				<label for="stageSel">Stage</label>
				<Select id="stageSel" bind:value={stageId} disabled={rallyId == null}>
					<option value={null}>—</option>
					{#each stages as s}<option value={s.id}>{s.name}</option>{/each}
				</Select>
			</div>
		</div>
	</Card>

	<Card class="p-4">
		<h5 class="mb-2 font-bold">Blip capture</h5>
		<label><input type="checkbox" bind:checked={captureEnabled} /> Capture enabled</label>
		<div class="mt-2 text-sm">Last tag: {lastTag} ({lastStatus})</div>
	</Card>

	<Card class="p-4">
		<h5 class="mb-2 font-bold">Gate capture (WebSerial)</h5>
		<div class="flex gap-2">
			{#if !gateConnected}
				<Button onclick={connectGate}>Connect</Button>
			{:else}
				<Button color="red" onclick={disconnectGate}>Disconnect</Button>
			{/if}
		</div>
		<div class="mt-2 text-sm">Status: {gateStatus}</div>
	</Card>
</div>
