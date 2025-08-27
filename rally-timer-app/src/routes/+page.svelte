<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<h2>Passings</h2>
<ul>
	{#each data.passings as passing}
		<li>Passing gate "{passing.gate_id}" @ {passing.timestamp} ms</li>
	{/each}
</ul>
