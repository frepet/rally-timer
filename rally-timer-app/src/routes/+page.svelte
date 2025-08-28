<script lang="ts">
	import type { PageProps } from './$types';
	import { List, Card, P, Button } from 'flowbite-svelte';
	let { data }: PageProps = $props();
	let passings = $state(data.passings);

	$effect(() => {
		const timeout = setInterval(async () => {
			let result = await fetch('/api/gate');
			passings = await result.json();
		}, 1000);
		return () => {
			clearTimeout(timeout);
		};
	});

	async function clearAllPassings() {
		await fetch('/api/gate', { method: 'DELETE' });
		let result = await fetch('/api/gate');
		passings = await result.json();
	}
</script>

<div class="w-full p-5">
	<Card class="max-w-none p-4 sm:p-6 md:p-8">
		<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Passings</h5>
		<Button class="w-0" onclick={clearAllPassings}>Clear</Button>
		<List>
			{#each passings as passing}
				<P>
					- {passing.gate_id} @ {passing.timestamp} ms
				</P>
			{/each}
		</List>
	</Card>
</div>
