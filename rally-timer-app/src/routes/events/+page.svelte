<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Input, Select } from 'flowbite-svelte';
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

<div class="page page--narrow">
	<h1 class="page-title">{t.navEvents}</h1>
	{#if error}<p role="alert" class="alert-error">{error}</p>{/if}
	{#if auth.isAdmin}
		<section class="panel panel-body">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					createEvent();
				}}
				class="flex flex-wrap items-end gap-3"
			>
				<div class="min-w-56 flex-1">
					<label for="event-name" class="field-label">{t.eventName}</label>
					<Input id="event-name" required bind:value={name} />
				</div>
				<div class="min-w-40">
					<label for="event-type" class="field-label">{t.eventType}</label>
					<Select id="event-type" bind:value={type}>
						<option value="rally">{t.navRally}</option>
						<option value="rallycross">{t.navRallycross}</option>
						<option value="training">{t.navTraining}</option>
					</Select>
				</div>
				<Button type="submit" disabled={saving}>{t.eventCreate}</Button>
			</form>
		</section>
	{/if}
	<section class="panel overflow-hidden">
		<ul class="divide-y divide-surface-100 dark:divide-white/6">
			{#each ordered as event (event.id)}
				<li
					class="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-50 sm:px-6 dark:hover:bg-white/3"
				>
					<a href={`/events/${event.id}`} class="flex min-w-0 flex-1 items-center gap-3">
						<span
							class="chip w-24 justify-center {event.type === 'rally'
								? 'chip--primary'
								: event.type === 'rallycross'
									? 'chip--warn'
									: 'chip--ok'}"
							>{event.type === 'rally'
								? t.navRally
								: event.type === 'rallycross'
									? t.navRallycross
									: t.navTraining}</span
						>
						<span
							class="truncate text-lg font-semibold text-surface-900 group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-500"
							>{event.name}</span
						>
					</a>
					{#if auth.isAdmin}<Button
							color="alternative"
							size="xs"
							href={`/events/${event.id}/manage`}>{t.eventManage}</Button
						>{/if}
				</li>
			{:else}<li class="p-4 sm:p-6">
					<p class="empty dark:text-surface-400">{t.eventEmpty}</p>
				</li>{/each}
		</ul>
	</section>
</div>
