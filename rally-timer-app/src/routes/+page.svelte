<script lang="ts">
	import { onMount } from 'svelte';
	import { events, eventHelpers } from '$lib/stores/events';
	import { startRfidWedge, type RfidStopFn } from '$lib/input/rfidWedge';

	let stopRfid: RfidStopFn | null = null;

	onMount(() => {
		// RFID keyboard wedge
		stopRfid = startRfidWedge(
			(tag) => {
				eventHelpers.rfidBlip({ ts: new Date().toISOString(), src: 'localhost', tag });
			},
			{
				minLength: 3,
				idleResetMs: 500,
				maxBurstMs: 3000,
				terminators: ['Enter', 'Tab']
			}
		);

		return () => {
			stopRfid?.();
		};
	});

	// Utility: safe syntax highlighting
	export function highlightJson(input: unknown): string {
		let json = typeof input === 'string' ? input : JSON.stringify(input, undefined, 2);

		// escape HTML first
		json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		// add spans around tokens
		return json.replace(
			/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
			(match: string) => {
				let cls = 'number';
				if (/^"/.test(match)) {
					cls = /:$/.test(match) ? 'key' : 'string';
				} else if (/true|false/.test(match)) {
					cls = 'boolean';
				} else if (/null/.test(match)) {
					cls = 'null';
				}
				return `<span class="${cls}">${match}</span>`;
			}
		);
	}
</script>

<h1>Events</h1>

<ol>
	{#each $events as e}
		<li>
			<details>
				<summary>
					{#if e.type === 'rfid_blip'}
						<strong>RFID blip</strong> — {e.payload?.tag}
					{:else if e.type === 'beam_break'}
						<strong>Beam break</strong> — {e.payload?.gate}
					{:else}
						<strong>{e.type}</strong> — {new Date(e.ts).toLocaleTimeString()}
					{/if}
				</summary>

				<pre><code>{@html highlightJson(e)}</code></pre>
			</details>
		</li>
	{/each}
</ol>

<style>
	:global(code) {
		font-family: monospace;
		font-size: 0.9rem;
	}

	:global(details) {
		margin-bottom: 0.5rem;
	}

	:global(summary) {
		cursor: pointer;
	}

	:global(.string) {
		color: green;
	}
	:global(.number) {
		color: darkorange;
	}
	:global(.boolean) {
		color: blue;
	}
	:global(.null) {
		color: magenta;
	}
	:global(.key) {
		color: red;
	}
</style>
