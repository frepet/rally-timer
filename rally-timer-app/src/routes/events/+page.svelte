<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge, Button, Card, Input, Select } from 'flowbite-svelte';
	import { goto } from '$app/navigation';
	import { kcFetch } from '$lib/kcFetch';
	import { t } from '$lib/stores/locale.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { sortEvents, type DisplayEvent } from '$lib/domain/eventPresentation';
	let events = $state<DisplayEvent[]>([]);
	let name = $state('');
	let type = $state<DisplayEvent['type']>('rally');
	let error = $state('');
	let saving = $state(false);
	const ordered = $derived(sortEvents(events));
	onMount(async () => {
		try {
			const res = await kcFetch('/api/events');
			if (!res.ok) throw new Error(await res.text());
			events = (await res.json()).events;
		} catch (e) {
			error = String(e);
		}
	});
	async function createEvent() {
		saving = true;
		error = '';
		try {
			const res = await kcFetch('/api/events', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, type })
			});
			if (!res.ok) throw new Error(await res.text());
			const event = await res.json();
			await goto(`/events/${event.id}/manage`);
		} catch (e) {
			error = String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="w-full space-y-6 p-5">
	<h1 class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
		{t.navEvents}
	</h1>
	{#if error}<p role="alert" class="text-red-600">{error}</p>{/if}
	{#if auth.isAdmin}
		<Card class="max-w-none p-4 sm:p-6">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					createEvent();
				}}
				class="flex flex-wrap items-end gap-3"
			>
				<div class="min-w-56 flex-1">
					<label for="event-name" class="mb-1 block text-sm font-medium">{t.eventName}</label>
					<Input id="event-name" required bind:value={name} />
				</div>
				<div class="min-w-40">
					<label for="event-type" class="mb-1 block text-sm font-medium">{t.eventType}</label>
					<Select id="event-type" bind:value={type}>
						<option value="rally">{t.navRally}</option>
						<option value="rallycross">{t.navRallycross}</option>
						<option value="training">{t.navTraining}</option>
					</Select>
				</div>
				<Button type="submit" disabled={saving}>{t.eventCreate}</Button>
			</form>
		</Card>
	{/if}
	{#each ordered as event (event.id)}
		<Card class="max-w-none p-4 sm:p-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<a
						class="text-lg font-semibold text-primary-600 hover:underline dark:text-primary-500"
						href={`/events/${event.id}`}>{event.name}</a
					>
					<Badge color="gray"
						>{event.type === 'rally'
							? t.navRally
							: event.type === 'rallycross'
								? t.navRallycross
								: t.navTraining}</Badge
					>
				</div>
				{#if auth.isAdmin}<Button color="alternative" size="sm" href={`/events/${event.id}/manage`}
						>{t.eventManage}</Button
					>{/if}
			</div>
		</Card>
	{:else}<p>{t.eventEmpty}</p>{/each}
</div>
