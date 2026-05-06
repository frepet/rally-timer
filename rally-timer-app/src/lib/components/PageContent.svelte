<script lang="ts">
	import { Button, Textarea } from 'flowbite-svelte';
	import { EditOutline } from 'flowbite-svelte-icons';
	import { marked } from 'marked';
	import { isAdmin } from '$lib/stores/auth';
	import { kcFetch } from '$lib/kcFetch';

	let {
		slug,
		content: initialContent,
		html: initialHtml
	} = $props<{
		slug: string;
		content: string;
		html: string;
	}>();

	let editing = $state(false);
	let draft = $state(initialContent);
	let html = $state(initialHtml);
	let saving = $state(false);
	let saveError = $state('');

	async function save() {
		saving = true;
		saveError = '';
		try {
			const res = await kcFetch(`/api/page/${slug}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: draft })
			});
			if (!res.ok) throw new Error(await res.text());
			html = marked(draft) as string;
			editing = false;
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	function startEdit() {
		draft = draft;
		editing = true;
	}
</script>

<div class="w-full px-4 py-8">
	{#if editing}
		<div class="mb-2 flex gap-2">
			<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
			<Button color="alternative" onclick={() => (editing = false)} disabled={saving}>Cancel</Button
			>
		</div>
		<Textarea
			bind:value={draft}
			class="mb-4 w-full font-mono text-sm"
			style="field-sizing: content; min-height: 8rem"
		/>
		{#if saveError}
			<p class="mb-2 text-sm text-red-500">{saveError}</p>
		{/if}
	{:else}
		{#if $isAdmin}
			<Button color="primary" class="mb-2" onclick={startEdit}>Edit</Button>
		{/if}
		<div class="prose max-w-none dark:prose-invert [&_li]:my-0 [&_ol]:my-2 [&_ul]:my-2">
			{@html html}
		</div>
	{/if}
</div>
