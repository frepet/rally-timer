<script lang="ts">
	import { tick } from 'svelte';
	import { CheckOutline, ChevronDownOutline, SearchOutline } from 'flowbite-svelte-icons';

	import { filterEvents, type DisplayEvent } from '$lib/domain/eventPresentation';
	import { getLocale, t } from '$lib/stores/locale.svelte';

	let {
		id,
		events,
		selectedId,
		onselect,
		automaticLabel,
		disabled = false
	}: {
		id: string;
		events: DisplayEvent[];
		selectedId: number | null;
		onselect: (id: number | null) => void;
		automaticLabel?: string;
		disabled?: boolean;
	} = $props();

	type Option =
		| { kind: 'automatic'; id: null; label: string }
		| { kind: 'event'; id: number; event: DisplayEvent };

	let root = $state<HTMLDivElement>();
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLUListElement>();
	let open = $state(false);
	let query = $state('');
	let highlighted = $state(0);

	const selected = $derived(events.find((event) => event.id === selectedId) ?? null);
	const options = $derived.by(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const automatic: Option[] =
			automaticLabel && automaticLabel.toLocaleLowerCase().includes(normalizedQuery)
				? [{ kind: 'automatic', id: null, label: automaticLabel }]
				: [];
		return [
			...automatic,
			...filterEvents(events, query).map(
				(event): Option => ({ kind: 'event', id: event.id, event })
			)
		];
	});
	const listId = $derived(`${id}-options`);
	const optionId = (option: Option) => `${id}-option-${option.id ?? 'automatic'}`;

	function typeLabel(type: DisplayEvent['type']): string {
		return type === 'rally' ? t.navRally : type === 'rallycross' ? t.navRallycross : t.navTraining;
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(getLocale() === 'sv' ? 'sv-SE' : 'en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function show() {
		open = true;
		query = '';
		await tick();
		highlighted = Math.max(
			0,
			options.findIndex((option) => option.id === selectedId)
		);
		await tick();
		input?.focus();
		input?.select();
		keepHighlightedVisible();
	}

	function close() {
		open = false;
		query = '';
	}

	function choose(id: number | null) {
		close();
		if (id !== selectedId) onselect(id);
	}

	function oninput() {
		highlighted = 0;
		void tick().then(keepHighlightedVisible);
	}

	function keepHighlightedVisible() {
		const option = list?.children[highlighted] as HTMLElement | undefined;
		if (!list || !option) return;
		if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
		else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
			list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (!options.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = Math.min(options.length - 1, highlighted + 1);
			void tick().then(keepHighlightedVisible);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = Math.max(0, highlighted - 1);
			void tick().then(keepHighlightedVisible);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(options[highlighted].id);
		}
	}

	function onWindowPointerdown(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) close();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') close();
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} onkeydown={onWindowKeydown} />

<div class="relative" bind:this={root}>
	<button
		type="button"
		class="event-trigger"
		aria-haspopup="listbox"
		aria-expanded={open}
		{disabled}
		onclick={() => (open ? close() : show())}
	>
		<span class="min-w-0 flex-1 text-left">
			<span class="block truncate font-semibold text-surface-900 dark:text-white">
				{selected?.name ?? automaticLabel ?? t.eventSearchPlaceholder}
			</span>
			{#if selected}
				<span class="mt-0.5 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
					<span>{typeLabel(selected.type)}</span>
					<span aria-hidden="true">·</span>
					<span class="num">{formatDate(selected.created_at)}</span>
				</span>
			{:else if automaticLabel}
				<span class="mt-0.5 block text-xs text-surface-500 dark:text-surface-400"
					>{t.eventHomepage}</span
				>
			{/if}
		</span>
		<ChevronDownOutline
			class="h-4 w-4 shrink-0 text-surface-400 transition-transform {open ? 'rotate-180' : ''}"
		/>
	</button>

	{#if open}
		<div class="event-popover">
			<div class="relative border-b border-surface-100 p-2 dark:border-white/8">
				<SearchOutline
					class="pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-surface-400"
				/>
				<input
					bind:this={input}
					bind:value={query}
					type="search"
					role="combobox"
					aria-label={t.eventSearchLabel}
					aria-expanded="true"
					aria-controls={listId}
					aria-activedescendant={options[highlighted] ? optionId(options[highlighted]) : undefined}
					placeholder={t.eventSearchPlaceholder}
					class="w-full rounded-lg border-0 bg-surface-50 py-2.5 pr-3 pl-9 text-sm text-surface-900 outline-none ring-1 ring-surface-200 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-primary-500"
					{oninput}
					{onkeydown}
				/>
			</div>

			<ul id={listId} bind:this={list} role="listbox" class="max-h-72 overflow-y-auto p-1.5">
				{#each options as option, index (option.id ?? 'automatic')}
					<li id={optionId(option)} role="option" aria-selected={option.id === selectedId}>
						<button
							type="button"
							class="event-option"
							class:is-highlighted={index === highlighted}
							onpointerenter={() => (highlighted = index)}
							onclick={() => choose(option.id)}
						>
							{#if option.kind === 'automatic'}
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold text-surface-900 dark:text-white"
										>{option.label}</span
									>
									<span class="mt-1 block text-xs text-surface-400">{t.eventHomepage}</span>
								</span>
							{:else}
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold text-surface-900 dark:text-white"
										>{option.event.name}</span
									>
									<span class="mt-1 flex items-center gap-2">
										<span
											class="chip {option.event.type === 'rally'
												? 'chip--primary'
												: option.event.type === 'rallycross'
													? 'chip--warn'
													: 'chip--ok'}"
										>
											{typeLabel(option.event.type)}
										</span>
										<span class="num text-xs text-surface-400"
											>{formatDate(option.event.created_at)}</span
										>
									</span>
								</span>
							{/if}
							{#if option.id === selectedId}<CheckOutline
									class="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-500"
								/>{/if}
						</button>
					</li>
				{:else}
					<li class="px-3 py-8 text-center text-sm text-surface-500 dark:text-surface-400">
						{t.eventSearchEmpty}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.event-trigger {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--color-surface-50) 85%, transparent);
		padding: 0.625rem 0.75rem;
		box-shadow: inset 0 0 0 1px var(--color-surface-200);
		transition:
			box-shadow 120ms,
			background-color 120ms;
	}
	.event-trigger:hover {
		background: var(--color-surface-100);
	}
	.event-trigger:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	.event-trigger:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 2px var(--color-primary-500);
	}
	.event-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 50;
		width: min(24rem, calc(100vw - 2rem));
		overflow: hidden;
		border-radius: 0.875rem;
		background: #fff;
		box-shadow:
			0 18px 45px rgb(15 23 42 / 0.18),
			0 0 0 1px rgb(15 23 42 / 0.08);
	}
	.event-option {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		border-radius: 0.625rem;
		padding: 0.625rem 0.75rem;
		text-align: left;
	}
	.event-option.is-highlighted {
		background: var(--color-surface-100);
	}
	:global(.dark) .event-trigger {
		background: rgb(255 255 255 / 0.04);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
	}
	:global(.dark) .event-trigger:hover,
	:global(.dark) .event-option.is-highlighted {
		background: rgb(255 255 255 / 0.08);
	}
	:global(.dark) .event-popover {
		background: var(--color-surface-800);
		box-shadow: 0 18px 45px rgb(0 0 0 / 0.4);
	}
</style>
