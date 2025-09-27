<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, Select, Toggle, Range, Badge, P } from 'flowbite-svelte';
	import { kcFetch } from '../../lib/kcFetch';

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
		if (!ac)
			ac = new (window.AudioContext ||
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
				AudioContext)();
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
	function cueFinish() {
		// Single mid-high beep
		beep(1046, 140);
	}

	// --- Blip capture state
	let captureEnabled = $state(true);
	let lastTag = $state('');
	let lastDriver = $state<string>('—');
	let lastStatus = $state('');

	// --- Event log
	type SeenEvent = { kind: 'finish'; at: number; label: string };
	let log: SeenEvent[] = $state([]);
	const pushLog = (ev: SeenEvent) => {
		log = [{ ...ev }, ...log].slice(0, 30);
	};

	// --- “Now detected” banner state (big visual flash)
	type Flash = { kind: 'finish'; label: string; at: number };
	let flash: Flash | null = $state(null);
	let flashTimer: number | null = null;
	function triggerFlash(kind: 'finish', label: string) {
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
			const { driver } = await (await kcFetch(`/api/tag/${encodeURIComponent(key)}`)).json();
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

	async function kcFetchJSON<T>(url: string): Promise<T> {
		const res = await kcFetch(url);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
	async function loadRallies() {
		rallies = await kcFetchJSON<Rally[]>('/api/rally');
	}
	async function loadStages(id: number) {
		stages = await kcFetchJSON<Stage[]>(`/api/rally/${id}/stages`);
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
		} catch {
			/* ignore selection range errors */
		}
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
			if (tag) submitFinish(tag);
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

	async function submitFinish(tag: string) {
		if (!stageId) return;
		try {
			const res = await kcFetch('/api/finish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ stage_id: stageId, tag, source: 'keyboard-wedge' })
			});
			lastTag = tag;

			let responseData: { message?: string; driver_name?: string } | null = null;
			if (res.ok) {
				try {
					responseData = await res.json();
				} catch {
					/* ignore */
				}
			}

			let driverName: string | null = null;
			let isDuplicate = false;

			if (responseData?.message) {
				// Already finished
				lastStatus = 'Already finished';
				isDuplicate = true;
				// Still look up driver name for display
			} else if (responseData?.driver_name) {
				driverName = responseData.driver_name;
				lastStatus = 'OK';
			} else {
				lastStatus = res.ok ? 'OK' : `HTTP ${res.status}`;
			}

			if (!driverName) driverName = await findDriverByTag(tag);
			lastDriver = driverName ?? '—';

			if (!isDuplicate) {
				// cues only for new finishes
				triggerFlash('finish', driverName ? `${driverName} (${tag})` : tag);
				cueFinish();
				pushLog({ kind: 'finish', at: Date.now(), label: driverName ?? tag });
			}
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
				const savedRally = localStorage.getItem('finish:lastRallyId');
				if (savedRally) {
					rallyId = Number(savedRally);
					await loadStages(rallyId);
				}
				const savedStage = localStorage.getItem('finish:lastStageId');
				if (savedStage) stageId = Number(savedStage);
			} catch {
				/* ignore JSON parse */
			}
		})();

		return () => {
			captureEl?.removeEventListener('keydown', handleCaptureKey, {
				capture: true
			} as EventListenerOptions);
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
			localStorage.setItem('finish:lastStageId', String(stageId));
		}
	});
</script>

<!-- Hidden capture input for wedge scanners: always focused when capture is enabled -->
<input
	id="finish-capture"
	bind:this={captureEl}
	autocomplete="off"
	autocapitalize="off"
	spellcheck="false"
	inputmode="none"
	style="position:fixed; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;"
/>

<div id="finish-root" class="w-full space-y-6 p-5">
	{#if flash}
		<div class={`flash ${flash.kind}`}>
			FINISH: {flash.label}
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
					{#each rallies as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
				</Select>
			</div>
			<div>
				<label for="stageSel"><P>Stage</P></label>
				<Select id="stageSel" bind:value={stageId} disabled={rallyId == null}>
					<option value={null}>—</option>
					{#each stages as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
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
		<P class="mb-2 font-bold">Recent events</P>
		<ul class="space-y-1">
			{#each log as ev (ev.at)}
				<li class="flex items-center gap-3">
					<P>
						<Badge color="green">{ev.kind.toUpperCase()}</Badge>
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
	.flash.finish {
		background: linear-gradient(135deg, #16a34a, #22c55e);
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
