<script lang="ts">
	import { onMount } from 'svelte';
	import { finishes } from '$lib/stores/finishes';

	let url = 'http://localhost:8080/'; // adjust to your gate address

	onMount(() => {
		const es = new EventSource(url);

		es.onmessage = (msg) => {
			try {
				const data = JSON.parse(msg.data);
				finishes.push(data);
			} catch (err) {
				console.error('Bad event:', err);
			}
		};

		es.onerror = (err) => {
			console.error('SSE error:', err);
		};

		return () => es.close();
	});
</script>

<h1>Finish Events</h1>

<ul>
	{#each $finishes as f}
		<li>ID:{f.id}, TIME:{f.ts_utc}</li>
	{/each}
</ul>
