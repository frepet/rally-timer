<script lang="ts">
	import { Button, Textarea } from 'flowbite-svelte'
	import { marked } from 'marked'
	import { isAdmin } from '$lib/stores/auth'
	import { kcFetch } from '$lib/kcFetch'

	let { slug, content: initialContent, html: initialHtml } = $props<{
		slug: string
		content: string
		html: string
	}>()

	let editing = $state(false)
	let draft = $state(initialContent)
	let html = $state(initialHtml)
	let saving = $state(false)
	let saveError = $state('')

	async function save() {
		saving = true
		saveError = ''
		try {
			const res = await kcFetch(`/api/page/${slug}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: draft })
			})
			if (!res.ok) throw new Error(await res.text())
			html = marked(draft) as string
			editing = false
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Save failed'
		} finally {
			saving = false
		}
	}

	function startEdit() {
		draft = draft
		editing = true
	}
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
	{#if editing}
		<Textarea bind:value={draft} rows={24} class="mb-4 font-mono text-sm" />
		{#if saveError}
			<p class="mb-2 text-sm text-red-500">{saveError}</p>
		{/if}
		<div class="flex gap-2">
			<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
			<Button color="alternative" onclick={() => (editing = false)} disabled={saving}>Cancel</Button>
		</div>
	{:else}
		{#if $isAdmin}
			<div class="mb-4 flex justify-end">
				<Button color="alternative" size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
		<div class="prose dark:prose-invert max-w-none">
			{@html html}
		</div>
	{/if}
</div>
