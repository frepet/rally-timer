<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, Button, Select, Toggle, Range, Badge, Heading, P } from 'flowbite-svelte';

	type Rally = { id: number; name: string };
	type Stage = { id: number; rally_id: number; name: string };

	let rallies = $state<Rally[]>([]);
	let stages = $state<Stage[]>([]);
	let rallyId = $state<number | null>(null);
	let stageId = $state<number | null>(null);

	// --- UX settings
	let soundsEnabled = $state(true);
	let volume = $state(1.0);

	// --- Audio
	let ac: AudioContext | null = null;
	function ensureAC() {
		if (!ac) ac = new (window.AudioContext || (window as any).webkitAudioContext)();
	}
	async function beep(freq = 880, ms = 120, when = 0) {
		if (!soundsEnabled) return;
		ensureAC();
		if (!ac) return;
		const t0 = ac.currentTime + when;
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		osc.frequency.value = freq;
		gain.gain.value = 0.0001; // pop-free ramp
		osc.connect(gain).connect(ac.destination);
		osc.start(t0);
		// simple click-free envelope
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
		osc.stop(t0 + ms / 1000 + 0.01);
	}

	// Distinct cue sets
	function cueBlip() {
		// Single mid-high beep
		beep(1046, 140);
	}
	function cueGate() {
		// Two short lower beeps
		beep(659, 100, 0);
		beep(784, 100, 0.12);
	}

	// --- Blip capture state
	let captureEnabled = $state(true);
	let lastTag = $state('');
	let lastDriver = $state<string>('—');
	let lastStatus = $state('');

	// --- Gate capture state
	let gateConnected = $state(false);
	let gateStatus = $state('');

	// --- Event log
	type SeenEvent = { kind: 'blip' | 'gate'; at: number; label: string };
	let log: SeenEvent[] = $state([]);
	const pushLog = (ev: SeenEvent) => {
		log = [{ ...ev }, ...log].slice(0, 30);
	};

	// --- “Now detected” banner state (big visual flash)
	type Flash = { kind: 'blip' | 'gate'; label: string; at: number };
	let flash: Flash | null = $state(null);
	let flashTimer: number | null = null;
	function triggerFlash(kind: 'blip' | 'gate', label: string) {
		flash = { kind, label, at: Date.now() };
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = window.setTimeout(() => (flash = null), 2200);
	}

	// --- driver lookup cache by tag
	const driverCache = new Map<string, string>(); // tag -> driver_name

	async function findDriverByTag(tag: string): Promise<string | null> {
		const key = tag.trim();
		if (!key) return null;
		if (driverCache.has(key)) return driverCache.get(key)!;

		try {
			const { driver } = await (await fetch(`/api/tag/${encodeURIComponent(key)}`)).json();
			const name = driver?.name ?? null;
			return name;
		} catch {
			// ignore network/parse errors; fall through
		}
		return null;
	}

	function fmtTime(ms: number) {
		return new Date(ms).toLocaleTimeString();
	}

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
		localStorage.setItem('blip:lastRallyId', String(rallyId));
	}

	// --- Blip capture (keyboard wedge)
	let buffer = '';
	let lastKeyTime = 0;
	const GAP_RESET_MS = 500;

	let captureEl: HTMLInputElement | null = null;

	function isTypingField(el: Element | null): boolean {
		const e = el as HTMLElement | null;
		if (!e) return false;
		if (e.isContentEditable) return true;
		const tag = e.tagName?.toLowerCase();
		if (tag === 'textarea') return true;
		if (tag === 'input') {
			const t = (e as HTMLInputElement).type?.toLowerCase();
			return ['text', 'search', 'password', 'email', 'number', 'url', 'tel'].includes(t);
		}
		return false;
	}

	function focusCapture() {
		if (!captureEnabled || !captureEl) return;
		const ae = document.activeElement as Element | null;
		if (isTypingField(ae)) return; // don’t steal from real text fields
		captureEl.focus();
		// place caret at end
		const len = captureEl.value.length;
		try {
			captureEl.setSelectionRange(len, len);
		} catch {}
	}

	function handleCaptureKey(ev: KeyboardEvent) {
		if (!captureEnabled) return;

		const now = performance.now();
		if (now - lastKeyTime > GAP_RESET_MS) buffer = '';
		lastKeyTime = now;

		if (ev.key === 'Enter' || ev.key === 'Tab') {
			ev.preventDefault();
			const tag = (buffer || captureEl?.value || '').trim();
			buffer = '';
			if (captureEl) captureEl.value = '';
			if (tag) submitBlip(tag);
			return;
		}
		if (ev.key === 'Escape') {
			buffer = '';
			if (captureEl) captureEl.value = '';
			return;
		}
		if (ev.key.length === 1) {
			buffer += ev.key;
			if (captureEl) captureEl.value += ev.key; // keep mirror
		}
	}

	async function submitBlip(tag: string) {
		if (!stageId) return;
		try {
			const res = await fetch('/api/blip', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ stage_id: stageId, tag, source: 'keyboard-wedge' })
			});
			lastTag = tag;
			lastStatus = res.ok ? 'OK' : `HTTP ${res.status}`;

			// if backend returns { driver_name }, use it; else look it up
			let driverName: string | null = null;
			if (res.ok) {
				try {
					const j = await res
						.clone()
						.json()
						.catch(() => null);
					driverName = j?.driver_name ?? null;
				} catch {}
			}
			if (!driverName) driverName = await findDriverByTag(tag);
			lastDriver = driverName ?? '—';

			// cues
			triggerFlash('blip', driverName ? `${driverName} (${tag})` : tag);
			cueBlip();
			pushLog({ kind: 'blip', at: Date.now(), label: driverName ?? tag });
		} catch {
			lastStatus = 'Network error';
		}
	}

	onMount(() => {
		// hook up the hidden input
		captureEl?.addEventListener('keydown', handleCaptureKey, { capture: true });

		// keep the hidden input focused whenever we click around / refocus
		const keepFocus = () => focusCapture();
		document.addEventListener('click', keepFocus, true);
		document.addEventListener('focusin', keepFocus);

		// initial focus for scanners
		focusCapture();

		// initial data
		(async () => {
			try {
				await loadRallies();
				const savedRally = localStorage.getItem('blip:lastRallyId');
				if (savedRally) {
					rallyId = Number(savedRally);
					await loadStages(rallyId);
				}
				const savedStage = localStorage.getItem('blip:lastStageId');
				if (savedStage) stageId = Number(savedStage);
			} catch {}
		})();

		return () => {
			captureEl?.removeEventListener('keydown', handleCaptureKey, { capture: true } as any);
			document.removeEventListener('click', keepFocus, true);
			document.removeEventListener('focusin', keepFocus);
		};
	});

	$effect(() => {
		// toggle capture focus as the user enables/disables it
		if (captureEnabled) focusCapture();
		else {
			if (document.activeElement === captureEl) (document.activeElement as HTMLElement)?.blur();
		}
	});

	$effect(() => {
		if (stageId != null) {
			localStorage.setItem('blip:lastStageId', String(stageId));
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
		if (!('serial' in navigator)) {
			gateStatus = 'Web Serial not supported (use Chrome/Edge over HTTPS).';
			return;
		}
		port = await navigator.serial.requestPort();
		await port.open({ baudRate: baud });

		const textStream = (port.readable as ReadableStream<Uint8Array>)
			.pipeThrough(new TextDecoderStream())
			.pipeThrough(new TransformStream<string, string>(new LineBreakTransformer()));

		reader = textStream.getReader();

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
			// @ts-ignore optional chaining not typed on some libs
			await port?.readable?.cancel?.();
		} catch {}
		try {
			await port?.close();
		} catch {}
		reader = null;
		port = null;
	}

	async function listenGate(reader: ReadableStreamDefaultReader<string>) {
		try {
			while (gateConnected) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;

				// Expecting 'P' lines from the gate
				if (value.trim() === 'P') {
					gateStatus = `Pulse @ ${new Date().toLocaleTimeString()}`;
					triggerFlash('gate', 'Gate pulse');
					cueGate();
					pushLog({ kind: 'gate', at: Date.now(), label: 'Pulse' });

					if (stageId) {
						await fetch('/api/gate', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ stage_id: stageId, source: 'webserial' })
						});
					}
				}
			}
		} finally {
			// ensure UI is consistent if the stream ends
			if (gateConnected) {
				gateConnected = false;
				gateStatus = 'Disconnected';
			}
		}
	}
</script>

<!-- Hidden capture input for wedge scanners: always focused when capture is enabled -->
<input
	id="blip-capture"
	bind:this={captureEl}
	autocomplete="off"
	autocapitalize="off"
	spellcheck="false"
	inputmode="none"
	style="position:fixed; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;"
/>

<div id="blipper-root" class="w-full space-y-6 p-5">
	{#if flash}
		<div class={`flash ${flash.kind}`}>
			{flash.kind === 'blip' ? 'BLIP: ' : 'GATE: '}
			{flash.label}
			<span class="ml-3 text-xs font-normal opacity-90">[{fmtTime(flash.at)}]</span>
		</div>
	{/if}

	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<P class="mb-4 text-xl font-bold">Select rally/stage</P>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div>
				<label for="rallySel"><P>Rally</P></label>
				<Select id="rallySel" bind:value={rallyId} onchange={onSelectRally}>
					<option value={null}>—</option>
					{#each rallies as r}<option value={r.id}>{r.name}</option>{/each}
				</Select>
			</div>
			<div>
				<label for="stageSel"><P>Stage</P></label>
				<Select id="stageSel" bind:value={stageId} disabled={rallyId == null}>
					<option value={null}>—</option>
					{#each stages as s}<option value={s.id}>{s.name}</option>{/each}
				</Select>
			</div>
			<div class="flex items-end gap-4">
				<P class="flex items-center gap-2">
					<Toggle bind:checked={captureEnabled} />
					<span>Capture enabled</span>
				</P>
				<P class="flex items-center gap-2">
					<Toggle bind:checked={soundsEnabled} />
					<span>Sound</span>
				</P>
				<P class="flex w-40 items-center gap-2">
					<span class="text-xs opacity-70">Vol</span>
					<Range min={0} max={1} step={0.01} bind:value={volume} />
				</P>
			</div>
		</div>
	</Card>

	<Card class="p-4">
		<P class="mb-2 text-xl font-bold">Now detected</P>
		<div class="grid gap-2 sm:grid-cols-3">
			<div class="rounded-2xl border p-3">
				<P class="text-xs opacity-60">Driver</P>
				<P class="text-4xl font-bold">{lastDriver}</P>
			</div>
			<div class="rounded-xl border p-3">
				<P class="text-xs opacity-60">Tag</P>
				<P class="font-mono text-xl">{lastTag || '—'}</P>
			</div>
			<div class="rounded-xl border p-3">
				<P class="text-xs opacity-60">Last status</P>
				<P class="text-xl">{lastStatus || '—'}</P>
			</div>
		</div>
	</Card>

	<Card class="p-4">
		<P class="mb-2 font-bold">Gate capture (WebSerial)</P>
		<div class="flex flex-wrap items-center gap-3">
			{#if !gateConnected}
				<Button onclick={connectGate}>Connect</Button>
			{:else}
				<Button color="red" onclick={disconnectGate}>Disconnect</Button>
			{/if}
			<Badge color={gateConnected ? 'green' : 'gray'}
				>{gateConnected ? 'Connected' : 'Disconnected'}</Badge
			>
			<P class="text-sm">Status: {gateStatus}</P>
			<P class="text-xs opacity-70">Baud: {baud}</P>
		</div>
	</Card>

	<Card class="p-4">
		<P class="mb-2 font-bold">Recent events</P>
		<ul class="space-y-1">
			{#each log as ev}
				<li class="flex items-center gap-3">
					<P>
						<Badge color={ev.kind === 'blip' ? 'green' : 'blue'}>{ev.kind.toUpperCase()}</Badge>
						<span class="font-mono text-sm">{fmtTime(ev.at)}</span>
						<span>•</span>
						<span class="font-semibold">{ev.label}</span>
					</P>
				</li>
			{/each}
			{#if !log.length}
				<li class="text-sm opacity-70"><P>No events yet.</P></li>
			{/if}
		</ul>
	</Card>
</div>

<style>
	/* Big “now detected” banner */
	.flash {
		position: fixed;
		left: 50%;
		top: 5%;
		transform: translateX(-50%);
		min-width: min(90vw, 720px);
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		color: white;
		font-weight: 700;
		text-align: center;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
		animation:
			pop 180ms ease-out,
			fadeout 2.2s ease-in forwards;
	}
	.flash.blip {
		background: linear-gradient(135deg, #16a34a, #22c55e);
	}
	.flash.gate {
		background: linear-gradient(135deg, #2563eb, #60a5fa);
	}

	@keyframes pop {
		from {
			transform: translateX(-50%) scale(0.95);
			opacity: 0;
		}
		to {
			transform: translateX(-50%) scale(1);
			opacity: 1;
		}
	}
	@keyframes fadeout {
		0% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
</style>
