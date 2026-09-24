<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Select } from 'flowbite-svelte';
	import { startLiveRefresh } from '$lib/liveRefresh';
	import { goto } from '$app/navigation';
	import { kcFetch } from '$lib/kcFetch';
	import { auth } from '$lib/stores/auth.svelte';
	import { t } from '$lib/stores/locale.svelte';
	import {
		chooseHomepageEvent,
		sortEvents,
		type DisplayEvent
	} from '$lib/domain/eventPresentation';
	import EventResults from '$lib/EventResults.svelte';
	let { eventId = null }: { eventId?: number | null } = $props();
	let events = $state<DisplayEvent[]>([]);
	let pinnedId = $state<number | null>(null);
	let loaded = $state(false);
	let error = $state('');
	let saving = $state(false);
	const ordered = $derived(sortEvents(events));
	const event = $derived(
		eventId === null
			? chooseHomepageEvent(events, pinnedId)
			: (events.find((e) => e.id === eventId) ?? null)
	);
	async function load() {
		try {
			const [a, b] = await Promise.all([kcFetch('/api/events'), kcFetch('/api/settings')]);
			if (!a.ok || !b.ok) throw new Error(t.eventLoadFailed);
			events = (await a.json()).events;
			pinnedId = (await b.json()).pinned_event_id ?? null;
		} catch (e) {
			error = String(e);
		} finally {
			loaded = true;
		}
	}
	onMount(() => {
		void load();
		return startLiveRefresh(load);
	});
	async function pin(id: number | null) {
		saving = true;
		try {
			const res = await kcFetch('/api/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned_event_id: id })
			});
			if (!res.ok) throw new Error(await res.text());
			pinnedId = id;
		} catch (e) {
			error = String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="page pb-0">
	{#if error}<p role="alert" class="alert-error">{error}</p>{/if}
	{#if loaded && event}
		<section class="panel overflow-hidden">
			<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-4 sm:p-6">
				<div class="min-w-0 space-y-2">
					<span class="chip chip--primary"
						>{event.type === 'rally'
							? t.navRally
							: event.type === 'rallycross'
								? t.navRallycross
								: t.navTraining}</span
					>
					<h1 class="page-title break-words">{event.name}</h1>
				</div>
				<div class="flex w-full flex-wrap items-end gap-3 sm:w-auto">
					<div class="w-full sm:w-56">
						<label for="view-event" class="field-label">{t.navEvents}</label>
						<Select
							id="view-event"
							size="sm"
							value={event.id}
							onchange={(e) => goto(`/events/${e.currentTarget.value}`)}
						>
							{#each ordered as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
						</Select>
					</div>
					{#if auth.isAdmin}
						<div class="w-full sm:w-56">
							<label for="homepage-event" class="field-label">{t.eventHomepage}</label>
							<Select
								id="homepage-event"
								size="sm"
								disabled={saving}
								value={pinnedId ?? ''}
								onchange={(e) => pin(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
							>
								<option value="">{t.eventAuto}</option>
								{#each ordered as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
							</Select>
						</div>
						<Button color="alternative" size="sm" href={`/events/${event.id}/manage`}
							>{t.eventManage}</Button
						>
					{/if}
				</div>
			</div>
		</section>
	{:else if loaded}
		<div class="empty dark:text-surface-400">
			<p>{eventId === null ? t.eventEmpty : t.eventLoadFailed}</p>
			<a
				class="mt-2 inline-block font-medium text-primary-600 hover:underline dark:text-primary-500"
				href="/events">{t.navEvents}</a
			>
		</div>
	{/if}
</div>
{#if event}{#key event.id}<EventResults {event} />{/key}{/if}
