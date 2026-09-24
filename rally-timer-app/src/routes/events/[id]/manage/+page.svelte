<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from 'flowbite-svelte';
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

<div class="page pb-0">
	{#if error}<p role="alert" class="alert-error">{error}</p>{/if}
	{#if event}
		<section class="panel panel-body">
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div class="min-w-0 space-y-2">
					<a
						class="text-sm font-medium text-primary-600 hover:underline dark:text-primary-500"
						href="/events">← {t.navEvents}</a
					>
					<div class="flex flex-wrap items-center gap-3">
						<h1 class="page-title break-words">{event.name}</h1>
						{#if event.is_locked}<span class="chip">
								<LockOutline class="h-3 w-3" />{t.eventLocked}</span
							>{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button color="alternative" size="sm" href={`/events/${eventId}`}>{t.eventResults}</Button
					>
					{#if auth.isAdmin && event.type !== 'training'}
						<Button
							color="alternative"
							size="sm"
							disabled={saving}
							onclick={toggleLock}
							aria-label={event.is_locked ? t.eventUnlock : t.eventLock}
							title={event.is_locked ? t.eventUnlock : t.eventLock}
							class="gap-1.5"
						>
							{#if event.is_locked}<LockOpenOutline size="sm" />{:else}<LockOutline
									size="sm"
								/>{/if}
							{event.is_locked ? t.eventUnlock : t.eventLock}
						</Button>
					{/if}
				</div>
			</div>
		</section>
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
