<script lang="ts">
	import { onMount } from 'svelte';
	import { finishes } from '$lib/stores/finishes';
	import { startRfidWedge, type RfidStopFn } from '$lib/input/rfidWedge';

	let url = 'http://localhost:8080/'; // your gate

	let stopRfid: RfidStopFn | null = null;

	onMount(() => {
		// SSE: push ISO → Date
		const es = new EventSource(url);
		es.onmessage = (msg) => {
			try {
				const data = JSON.parse(msg.data);
				finishes.pushIso(data.ts_utc, data.id);
				finishes.trim(500);
			} catch (err) {
				console.error('Bad event:', err);
			}
		};
		es.onerror = (err) => console.error('SSE error:', err);

		// RFID wedge listener
		stopRfid = startRfidWedge(
			(tag) => {
				// associate tag to the latest recent finish
				finishes.associateTag(tag);
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
</script>

<h1>Finish Event Queue</h1>

<ol>
	{#each $finishes as f}
		<li>
			{f.gate_id}
			{f.ts.toISOString()}
			{#if f.id}
				— ID: {f.id}
			{/if}
		</li>
	{/each}
</ol>
