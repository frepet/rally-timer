<script lang="ts">
	import type { PageProps } from './$types';
	import {
		Card,
		Button,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell
	} from 'flowbite-svelte';
	import { TrashBinSolid } from 'flowbite-svelte-icons';
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
		<div class="mb-2 flex">
			<h5 class="mb-2 flex-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Passings
			</h5>
			<Button class="w-32" onclick={clearAllPassings}>Clear All</Button>
		</div>
		<Table hoverable={true}>
			<TableHead>
				<TableHeadCell>Gate</TableHeadCell>
				<TableHeadCell>Timestamp</TableHeadCell>
				<TableHeadCell class="flex justify-end">Actions</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each passings as passing}
					<TableBodyRow>
						<TableBodyCell>
							{passing.gate_id}
						</TableBodyCell>
						<TableBodyCell>
							{passing.timestamp}
						</TableBodyCell>
						<TableBodyCell class="flex justify-end">
							<Button
								size="xs"
								onclick={async () => {
									await fetch(`/api/gate/${passing.id}`, { method: 'DELETE' });
									let result = await fetch('/api/gate');
									passings = await result.json();
								}}><TrashBinSolid /></Button
							>
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</Card>
</div>
