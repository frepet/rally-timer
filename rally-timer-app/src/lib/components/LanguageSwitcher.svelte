<script lang="ts">
	import { getLocale, setLocale } from '../stores/locale.svelte';
</script>

<div class="flex gap-0.5 rounded-lg bg-surface-100 p-0.5 dark:bg-white/5">
	<button
		type="button"
		onclick={() => setLocale('sv')}
		class="rounded-md px-1.5 py-1 text-sm leading-none transition {getLocale() === 'sv'
			? 'bg-white opacity-100 shadow-sm dark:bg-surface-700'
			: 'opacity-40 hover:opacity-80'}"
		aria-label="Svenska"
		aria-pressed={getLocale() === 'sv'}
	>
		🇸🇪
	</button>
	<button
		type="button"
		onclick={() => setLocale('en')}
		class="rounded-md px-1.5 py-1 text-sm leading-none transition {getLocale() === 'en'
			? 'bg-white opacity-100 shadow-sm dark:bg-surface-700'
			: 'opacity-40 hover:opacity-80'}"
		aria-label="English"
		aria-pressed={getLocale() === 'en'}
	>
		🇬🇧
	</button>
</div>
