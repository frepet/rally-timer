<script lang="ts">
	import { onMount } from 'svelte';
	import { events, eventHelpers } from '$lib/stores/events';
	import { startRfidWedge, type RfidStopFn } from '$lib/input/rfidWedge';

	let url = 'http://localhost:8080/'; // your gate

	let stopRfid: RfidStopFn | null = null;

	onMount(() => {
		// SSE: push ISO → Date
		const es = new EventSource(url);
		es.onmessage = async (msg) => {
			await eventHelpers.beamBreak({
				ts: new Date().toISOString(),
				src: 'localhost',
				gate: msg.data.id
			});
		};

		// RFID wedge listener
		stopRfid = startRfidWedge(
			(tag) => {
				eventHelpers.rfidBlip({ ts: new Date().toISOString(), src: 'localhost', tag });
			},
			{
				minLength: 3, // typical tags > 6 chars
				idleResetMs: 500,
				maxBurstMs: 3000,
				terminators: ['Enter', 'Tab']
				// allowed: /^[0-9]$/     // uncomment if your tags are digits-only
			}
		);

		return () => {
			es.close();
			if (stopRfid) stopRfid();
		};
	});

	function syntaxHighlight(json: any) {
		if (typeof json != 'string') {
			json = JSON.stringify(json, undefined, 2);
		}
		json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return json.replace(
			/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
			function (match: any) {
				var cls = 'number';
				if (/^"/.test(match)) {
					if (/:$/.test(match)) {
						cls = 'key';
					} else {
						cls = 'string';
					}
				} else if (/true|false/.test(match)) {
					cls = 'boolean';
				} else if (/null/.test(match)) {
					cls = 'null';
				}
				return '<span class="' + cls + '">' + match + '</span>';
			}
		);
	}
</script>

<h1>Events</h1>

<ol>
	{#each $events as e}
		<li>
			<pre>{@html syntaxHighlight(e)}</pre>
		</li>
	{/each}
</ol>

<style>
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
