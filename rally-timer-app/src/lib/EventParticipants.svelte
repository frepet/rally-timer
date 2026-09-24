<script lang="ts">
	import { onMount } from 'svelte';
	import { Checkbox } from 'flowbite-svelte';
	import { classChipClass } from '$lib/classColor';
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

<section class="panel">
	<details class="group">
		<summary
			class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden"
		>
			<span class="panel-title">{t.eventParticipants}</span>
			<span class="text-surface-400 transition-transform group-open:rotate-180" aria-hidden="true"
				>▾</span
			>
		</summary>
		{#if error}<p role="alert" class="alert-error mx-4 mb-3 sm:mx-6">{error}</p>{/if}
		<div
			class="max-h-80 divide-y divide-surface-100 overflow-auto border-t border-surface-100 dark:divide-white/6 dark:border-white/8"
		>
			{#each drivers as driver (driver.id)}
				<label
					class="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-50 sm:px-6 dark:hover:bg-white/3"
				>
					<Checkbox
						disabled={saving}
						checked={driver.active}
						onchange={(e) => toggle(driver.id, e.currentTarget.checked)}
					/>
					<span class="font-medium">{driver.name}</span>
					{#if driver.class_name}<span class="chip {classChipClass(driver.class_name)}"
							>{driver.class_name}</span
						>{/if}
				</label>
			{/each}
		</div>
	</details>
</section>
