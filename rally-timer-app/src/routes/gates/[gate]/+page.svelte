<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createPassStore, type Pass } from '$lib/stores/passes';

	export let gate: string;
	export let initial: Pass[];

	const passes = createPassStore(initial);

	onMount(() => {
		passes.startStream(gate);
		return () => passes.stopStream();
	});
</script>

<h1>Gate {gate} — Passes</h1>

<ul>
	{#each $passes as p (p.ts_utc)}
		<li>{p.ts_utc}</li>
	{/each}
</ul>
