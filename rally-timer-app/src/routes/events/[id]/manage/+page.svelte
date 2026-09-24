<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Input, Modal } from 'flowbite-svelte';
	import {
		EditOutline,
		LockOpenOutline,
		LockOutline,
		TrashBinOutline
	} from 'flowbite-svelte-icons';
	import { goto } from '$app/navigation';
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
	let editingName = $state(false);
	let nameDraft = $state('');
	let renaming = $state(false);
	function startRename() {
		if (!event) return;
		nameDraft = event.name;
		editingName = true;
	}
	async function saveName() {
		const name = nameDraft.trim();
		if (!event || !name) return;
		if (name === event.name) {
			editingName = false;
			return;
		}
		renaming = true;
		error = '';
		try {
			const res = await kcFetch(`/api/events/${eventId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!res.ok) throw new Error(await res.text());
			editingName = false;
			await load();
		} catch (e) {
			error = String(e);
		} finally {
			renaming = false;
		}
	}
	function onNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveName();
		if (e.key === 'Escape') editingName = false;
	}
	let deleteModalOpen = $state(false);
	let deleting = $state(false);
	async function deleteEvent() {
		deleting = true;
		error = '';
		try {
			const res = await kcFetch(`/api/events/${eventId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			deleteModalOpen = false;
			await goto('/events');
		} catch (e) {
			error = String(e);
			deleteModalOpen = false;
		} finally {
			deleting = false;
		}
	}
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
						{#if editingName}
							<div class="flex w-full max-w-lg items-center gap-2">
								<div class="min-w-0 flex-1">
									<Input
										aria-label={t.eventName}
										bind:value={nameDraft}
										onkeydown={onNameKeydown}
										disabled={renaming}
										autofocus
									/>
								</div>
								<Button size="sm" onclick={saveName} disabled={renaming || !nameDraft.trim()}
									>{t.save}</Button
								>
								<Button
									size="sm"
									color="alternative"
									onclick={() => (editingName = false)}
									disabled={renaming}>{t.cancel}</Button
								>
							</div>
						{:else}
							<h1 class="page-title break-words">{event.name}</h1>
							{#if auth.isAdmin}
								<button
									type="button"
									class="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-white/10 dark:hover:text-surface-100"
									onclick={startRename}
									disabled={event.is_locked}
									aria-label={t.eventRename}
									title={event.is_locked ? t.eventRenameLocked : t.eventRename}
								>
									<EditOutline size="md" />
								</button>
							{/if}
						{/if}
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
					{#if auth.isAdmin}
						<Button
							color="red"
							outline
							size="sm"
							class="gap-1.5"
							disabled={event.is_locked}
							title={event.is_locked ? t.eventDeleteLocked : t.eventDelete}
							onclick={() => (deleteModalOpen = true)}
						>
							<TrashBinOutline size="sm" />
							{t.eventDelete}
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

{#if event}
	<Modal
		title={t.eventDeleteConfirm(event.name)}
		bind:open={deleteModalOpen}
		size="sm"
		autoclose={false}
	>
		<div class="space-y-4">
			<p class="text-surface-700 dark:text-surface-300">
				{t.eventDeleteDescription}
				{t.cannotBeUndone}
			</p>
			<div class="flex justify-end gap-2">
				<Button color="alternative" onclick={() => (deleteModalOpen = false)} disabled={deleting}
					>{t.cancel}</Button
				>
				<Button color="red" onclick={deleteEvent} disabled={deleting}>
					{deleting ? t.eventDeleting : t.eventDelete}
				</Button>
			</div>
		</div>
	</Modal>
{/if}
