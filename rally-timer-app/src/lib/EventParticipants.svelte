<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge, Card, Checkbox } from 'flowbite-svelte';
	import { kcFetch } from '$lib/kcFetch';
	import { t } from '$lib/stores/locale.svelte';
	import { participantIdsAfterToggle } from '$lib/domain/eventPresentation';
	let { eventId }: { eventId: number } = $props();
	let drivers = $state<{ id: number; name: string; class_name?: string; active: boolean }[]>([]);
	let error = $state('');
	let saving = $state(false);
	async function load() {
		const res = await kcFetch(`/api/events/${eventId}/participants`);
		if (!res.ok) throw new Error(await res.text());
		drivers = (await res.json()).drivers;
	}
	onMount(() => {
		load().catch((e) => (error = String(e)));
	});
	async function toggle(id: number, active: boolean) {
		saving = true;
		try {
			const res = await kcFetch(`/api/events/${eventId}/participants`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ driver_ids: participantIdsAfterToggle(drivers, id, active) })
			});
			if (!res.ok) throw new Error(await res.text());
			await load();
		} catch (e) {
			error = String(e);
		} finally {
			saving = false;
		}
	}
</script>

<Card class="max-w-none p-4 sm:p-6">
	<details>
		<summary class="small-caps cursor-pointer text-lg font-semibold tracking-widest">
			{t.eventParticipants}
		</summary>
		{#if error}<p role="alert" class="mt-3 text-red-600">{error}</p>{/if}
		<div class="mt-3 max-h-80 divide-y divide-gray-200 overflow-auto dark:divide-gray-700">
			{#each drivers as driver (driver.id)}
				<label class="flex items-center gap-3 py-2">
					<Checkbox
						disabled={saving}
						checked={driver.active}
						onchange={(e) => toggle(driver.id, e.currentTarget.checked)}
					/>
					<span>{driver.name}</span>
					{#if driver.class_name}<Badge color="gray">{driver.class_name}</Badge>{/if}
				</label>
			{/each}
		</div>
	</details>
</Card>
