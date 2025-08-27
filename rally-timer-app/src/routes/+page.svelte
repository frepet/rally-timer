<script lang="ts">
	import type { PageProps } from './$types';
	import { List, Card, P } from 'flowbite-svelte';
	let { data }: PageProps = $props();
</script>

<Card class="p-4 sm:p-6 md:p-8">
	<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Passings</h5>
	<List>
		{#each data.passings as passing}
			<P>
				Passing gate "{passing.gate_id}" @ {passing.timestamp} ms
			</P>
		{/each}
	</List>
</Card>
