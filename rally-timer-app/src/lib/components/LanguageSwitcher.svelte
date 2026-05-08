<script lang="ts">
	import { getLocale, setLocale } from '../stores/locale.svelte';
</script>

<div class="flex gap-1">
	<button
		type="button"
		onclick={() => setLocale('sv')}
		class="rounded px-1 py-0.5 text-base leading-none transition-opacity {getLocale() === 'sv'
			? 'opacity-100'
			: 'opacity-40 hover:opacity-70'}"
		aria-label="Svenska"
		aria-pressed={getLocale() === 'sv'}
	>
		🇸🇪
	</button>
	<button
		type="button"
		onclick={() => setLocale('en')}
		class="rounded px-1 py-0.5 text-base leading-none transition-opacity {getLocale() === 'en'
			? 'opacity-100'
			: 'opacity-40 hover:opacity-70'}"
		aria-label="English"
		aria-pressed={getLocale() === 'en'}
	>
		🇬🇧
	</button>
</div>
