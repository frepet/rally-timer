<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Card, P } from 'flowbite-svelte';

	let blipName = 'blip01';
	let captureEnabled = true;
	let lastTag = '';
	let lastStatus = '';

	// load persisted blip name
	onMount(() => {
		if (browser) {
			blipName = localStorage.getItem('blipName') ?? 'blip01';
		}
	});

	// persist when it changes
	$: browser && localStorage.setItem('blipName', blipName);

	// Keyboard wedge capture
	let buffer = '';
	let lastKeyTime = 0;
	const GAP_RESET_MS = 500; // if a key comes after this gap, start a new buffer

	function isEditable(el: EventTarget | null): boolean {
		const e = el as HTMLElement | null;
		if (!e) return false;
		const tag = e.tagName?.toLowerCase();
		return tag === 'input' || tag === 'textarea' || e.isContentEditable;
	}

	async function submitTag(tag: string) {
		const payload = {
			timestamp: Date.now(), // ms since epoch, UTC (zulu)
			tag
		};

		try {
			const res = await fetch(`/api/blip/${encodeURIComponent(blipName)}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			lastTag = tag;
			lastStatus = res.ok ? 'OK' : `HTTP ${res.status}`;
		} catch (err) {
			lastTag = tag;
			lastStatus = 'Network error';
			console.error('POST failed:', err);
		}
	}

	function handleKeydown(ev: KeyboardEvent) {
		if (!captureEnabled) return;
		// don't steal input when typing in form fields
		if (isEditable(ev.target)) return;

		const now = performance.now();
		if (now - lastKeyTime > GAP_RESET_MS) {
			buffer = '';
		}
		lastKeyTime = now;

		// end-of-scan sent by most readers
		if (ev.key === 'Enter' || ev.key === 'Tab') {
			ev.preventDefault();
			const tag = buffer.trim();
			buffer = '';
			if (tag.length) submitTag(tag);
			return;
		}

		// allow quick reset
		if (ev.key === 'Escape') {
			buffer = '';
			return;
		}

		// accumulate printable characters
		if (ev.key.length === 1) {
			buffer += ev.key;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown, { passive: false });
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="w-full p-5">
	<Card class="max-w-none space-y-4 p-4 sm:p-6 md:p-8">
		<P>While on this page any keyboard input will be interpreted as RFID blipping.</P>

		<div class="flex items-end gap-4">
			<div>
				<label class="mb-1 block text-sm font-medium">Blip name</label>
				<input
					class="w-48 rounded-lg border bg-white px-3 py-2 dark:bg-gray-800"
					placeholder="blip01"
					bind:value={blipName}
				/>
				<p class="mt-1 text-xs text-gray-500">POSTs to <code>/api/blip/{blipName}</code></p>
			</div>

			<label class="flex items-center gap-2 select-none">
				<input type="checkbox" bind:checked={captureEnabled} class="h-4 w-4" />
				<span>Capture enabled</span>
			</label>
		</div>

		<div class="rounded-lg border bg-gray-50 p-3 dark:bg-gray-900">
			<div class="text-sm text-gray-500">Last scan:</div>
			<div class="mt-1 font-mono">
				tag=<span class="font-semibold">{lastTag || '—'}</span>, status=<span class="font-semibold"
					>{lastStatus || '—'}</span
				>
			</div>
		</div>

		<P class="text-sm text-gray-500">
			Tip: Most readers send <em>Enter</em> at the end of a tag. If yours sends something else, change
			the end-key in the handler.
		</P>
	</Card>
</div>
