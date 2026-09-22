<script lang="ts">
	import { untrack } from 'svelte';
	import { Badge, Button, Card } from 'flowbite-svelte';
	import { LockOpenOutline, LockOutline } from 'flowbite-svelte-icons';
	import { page } from '$app/state';
	import { kcFetch } from '$lib/kcFetch';
	import { t } from '$lib/stores/locale.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import type { DisplayEvent } from '$lib/domain/eventPresentation';
	import RalliesManager from '$lib/RalliesManager.svelte';
	import RallycrossManager from '$lib/RallycrossManager.svelte';
	import TrainingManager from '$lib/TrainingManager.svelte';
	import EventParticipants from '$lib/EventParticipants.svelte';
	let event = $state<DisplayEvent | null>(null);
	let error = $state('');
	let saving = $state(false);
	const eventId = $derived(Number(page.params.id));
	let requestVersion = 0;
	async function load(id = eventId) {
		const version = ++requestVersion;
		try {
			const res = await kcFetch(`/api/events/${id}`);
			if (!res.ok) throw new Error(await res.text());
			const result = await res.json();
			if (version === requestVersion) event = result.event;
		} catch (e) {
			if (version === requestVersion) error = String(e);
		}
	}
	$effect(() => {
		const id = eventId;
		untrack(() => {
			event = null;
			error = '';
			load(id);
		});
		return () => {
			requestVersion++;
		};
	});
	async function toggleLock() {
		if (!event) return;
		saving = true;
		try {
			const res = await kcFetch(`/api/events/${eventId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ is_locked: !event.is_locked })
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

<div class="w-full space-y-4 p-5">
	{#if error}<p role="alert" class="text-red-600">{error}</p>{/if}
	{#if event}
		<Card class="max-w-none p-4 sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="space-y-2">
					<a class="text-sm text-primary-600 hover:underline dark:text-primary-500" href="/events"
						>{t.navEvents}</a
					>
					<div class="flex flex-wrap items-center gap-3">
						<h1 class="small-caps text-xl font-semibold tracking-widest text-black dark:text-white">
							{event.name}
						</h1>
						{#if event.is_locked}<Badge color="gray">{t.eventLocked}</Badge>{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button color="alternative" href={`/events/${eventId}`}>{t.eventResults}</Button>
					{#if auth.isAdmin && event.type !== 'training'}
						<Button
							color="alternative"
							disabled={saving}
							onclick={toggleLock}
							aria-label={event.is_locked ? t.eventUnlock : t.eventLock}
							title={event.is_locked ? t.eventUnlock : t.eventLock}
						>
							{#if event.is_locked}<LockOpenOutline size="sm" />{:else}<LockOutline
									size="sm"
								/>{/if}
							{event.is_locked ? t.eventUnlock : t.eventLock}
						</Button>
					{/if}
				</div>
			</div>
		</Card>
		{#if auth.isAdmin && !event.is_locked && event.type === 'training'}<EventParticipants
				{eventId}
			/>{/if}
	{/if}
</div>
{#if event && auth.isAdmin && !event.is_locked}
	{#key eventId}
		{#if event.type === 'rally'}<RalliesManager
				{eventId}
				onsubmitted={load}
			/>{:else if event.type === 'rallycross'}<RallycrossManager
				{eventId}
				onsubmitted={load}
			/>{:else}<TrainingManager {eventId} />{/if}
	{/key}
{/if}
