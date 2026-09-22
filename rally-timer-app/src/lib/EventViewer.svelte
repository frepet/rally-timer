<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Card, Select } from 'flowbite-svelte';
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

<div class="w-full space-y-3 p-5">
	{#if error}<p role="alert" class="text-red-600">{error}</p>{/if}
	{#if loaded && event}
		<Card class="max-w-none p-4 sm:p-6">
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div class="space-y-3">
					<h1 class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
						{event.name}
					</h1>
					<div class="w-64 max-w-full">
						<label for="view-event" class="mb-1 block text-sm font-medium">{t.navEvents}</label>
						<Select
							id="view-event"
							value={event.id}
							onchange={(e) => goto(`/events/${e.currentTarget.value}`)}
						>
							{#each ordered as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
						</Select>
					</div>
				</div>
				<div class="flex flex-wrap items-end gap-3">
					{#if auth.isAdmin}
						<div class="w-64 max-w-full">
							<label for="homepage-event" class="mb-1 block text-sm font-medium"
								>{t.eventHomepage}</label
							>
							<Select
								id="homepage-event"
								disabled={saving}
								value={pinnedId ?? ''}
								onchange={(e) => pin(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
							>
								<option value="">{t.eventAuto}</option>
								{#each ordered as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
							</Select>
						</div>
						<Button color="alternative" href={`/events/${event.id}/manage`}>{t.eventManage}</Button>
					{/if}
				</div>
			</div>
		</Card>
	{:else if loaded}<p>{eventId === null ? t.eventEmpty : t.eventLoadFailed}</p>
		<a class="text-primary-600 hover:underline dark:text-primary-500" href="/events"
			>{t.navEvents}</a
		>{/if}
</div>
{#if event}{#key event.id}<EventResults {event} />{/key}{/if}
