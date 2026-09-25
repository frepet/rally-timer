<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
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
	import EventCombobox from '$lib/components/EventCombobox.svelte';
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
		<section class="overflow-visible">
			<div class="w-full">
				<div class="w-full">
					<EventCombobox
						id="view-event"
						events={ordered}
						selectedId={event.id}
						prominent
						onselect={(id) => id !== null && goto(`/events/${id}`)}
					/>
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
{#if event}
	{#key event.id}<EventResults {event} />{/key}
	{#if auth.isAdmin}
		<div class="page pt-0">
			<section
				class="flex flex-wrap items-end justify-end gap-3 border-t border-surface-200 pt-6 dark:border-white/8"
			>
				<div class="w-full sm:w-72">
					<p class="field-label">{t.eventHomepage}</p>
					<EventCombobox
						id="homepage-event"
						events={ordered}
						selectedId={pinnedId}
						automaticLabel={t.eventAuto}
						disabled={saving}
						onselect={pin}
					/>
				</div>
				<Button color="alternative" size="sm" href={`/events/${event.id}/manage`}
					>{t.eventManage}</Button
				>
			</section>
		</div>
	{/if}
{/if}
