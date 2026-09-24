<script lang="ts">
	import { ChevronLeftOutline, ChevronRightOutline } from 'flowbite-svelte-icons';

	import { dragScroll } from '$lib/actions/dragScroll';
	import { stepStage } from '$lib/domain/stagePicker';
	import type { StageStatus } from '$lib/results';
	import { t } from '$lib/stores/locale.svelte';

	let {
		stages,
		active,
		onselect
	}: {
		stages: { name: string; status: StageStatus }[];
		active: string | null;
		onselect: (name: string) => void;
	} = $props();

	const names = $derived(stages.map((s) => s.name));
	const activeIndex = $derived(active === null ? -1 : names.indexOf(active));
	const current = $derived(activeIndex >= 0 ? stages[activeIndex] : null);

	let strip = $state<HTMLElement | null>(null);

	// Keep the selected tile visible when selection changes (prev/next, keys).
	$effect(() => {
		const i = activeIndex;
		if (!strip || i < 0) return;
		const tile = strip.children[i] as HTMLElement | undefined;
		if (!tile) return;
		// Scroll only the strip (scrollIntoView would also scroll the page).
		const left = tile.offsetLeft - strip.clientWidth / 2 + tile.offsetWidth / 2;
		strip.scrollTo({ left, behavior: 'smooth' });
	});

	// Which edges have more tiles hidden behind them (drives the edge fades,
	// since there is no scrollbar to hint at it).
	let fadeLeft = $state(false);
	let fadeRight = $state(false);
	function updateFades() {
		if (!strip) return;
		fadeLeft = strip.scrollLeft > 1;
		fadeRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
	}
	$effect(() => {
		if (!strip) return;
		void stages.length;
		updateFades();
		const ro = new ResizeObserver(updateFades);
		ro.observe(strip);
		return () => ro.disconnect();
	});

	function step(delta: -1 | 1) {
		const next = stepStage(names, active, delta);
		if (next !== null && next !== active) onselect(next);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			step(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			step(1);
		}
	}

	function statusLabel(status: StageStatus): string {
		if (status === 'live') return t.stageStatusLive;
		if (status === 'upcoming') return t.stageStatusUpcoming;
		return t.stageStatusClosed;
	}
</script>

<div class="space-y-2.5">
	<!-- Current stage with prev/next -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="nav-btn"
			aria-label={t.stagePrev}
			title={t.stagePrev}
			disabled={activeIndex <= 0}
			onclick={() => step(-1)}
		>
			<ChevronLeftOutline size="sm" />
		</button>
		<div class="min-w-0 flex-1 text-center">
			{#if current}
				<p
					class="display truncate text-lg leading-tight font-bold text-surface-900 dark:text-white"
				>
					{current.name}
				</p>
				<p class="flex items-center justify-center gap-1.5 text-xs text-surface-500">
					<span
						class="status-dot {current.status === 'live'
							? 'status-dot--live'
							: current.status === 'upcoming'
								? 'status-dot--upcoming'
								: 'status-dot--off'}"
					></span>
					{statusLabel(current.status)}
					<span class="text-surface-300 dark:text-surface-600">·</span>
					<span class="num">{t.stageCounter(activeIndex + 1, stages.length)}</span>
				</p>
			{/if}
		</div>
		<button
			type="button"
			class="nav-btn"
			aria-label={t.stageNext}
			title={t.stageNext}
			disabled={activeIndex < 0 || activeIndex >= stages.length - 1}
			onclick={() => step(1)}
		>
			<ChevronRightOutline size="sm" />
		</button>
	</div>

	<!-- One tile per stage, single scrollable row -->
	<div
		bind:this={strip}
		role="tablist"
		tabindex="0"
		aria-label={t.stagePickerLabel}
		class="strip relative flex gap-1.5 overflow-x-auto rounded-lg bg-surface-100 p-1.5 dark:bg-white/5"
		class:fade-left={fadeLeft}
		class:fade-right={fadeRight}
		use:dragScroll
		onscroll={updateFades}
		{onkeydown}
	>
		{#each stages as s, i (s.name)}
			<button
				type="button"
				role="tab"
				tabindex="-1"
				aria-selected={s.name === active}
				title={`${s.name} — ${statusLabel(s.status)}`}
				class="tile tile--{s.status}"
				onclick={() => onselect(s.name)}
			>
				{i + 1}
			</button>
		{/each}
	</div>
</div>

<style>
	.nav-btn {
		display: inline-flex;
		height: 2.25rem;
		width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		color: var(--color-surface-600);
		box-shadow: inset 0 0 0 1px var(--color-surface-200);
		transition: background-color 120ms;
	}
	.nav-btn:hover:not(:disabled) {
		background-color: var(--color-surface-100);
		color: var(--color-surface-900);
	}
	.nav-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	:global(.dark) .nav-btn {
		color: var(--color-surface-300);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
	}
	:global(.dark) .nav-btn:hover:not(:disabled) {
		background-color: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	.strip {
		scrollbar-width: none;
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		--fade: 2.5rem;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}
	.strip:global(.is-dragging) {
		cursor: grabbing;
	}
	.strip:global(.is-dragging) .tile {
		pointer-events: none;
	}
	/* Fade out whichever edge has more tiles behind it */
	.strip.fade-left {
		mask-image: linear-gradient(to right, transparent, #000 var(--fade));
	}
	.strip.fade-right {
		mask-image: linear-gradient(to left, transparent, #000 var(--fade));
	}
	.strip.fade-left.fade-right {
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent
		);
	}
	.strip:focus-visible {
		outline: 2px solid var(--color-primary-500);
		outline-offset: 2px;
	}

	.tile {
		position: relative;
		display: inline-flex;
		height: 2.25rem;
		min-width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.375rem;
		padding-inline: 0.5rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		cursor: inherit;
		color: var(--color-surface-600);
		background-color: #fff;
		box-shadow: inset 0 0 0 1px var(--color-surface-200);
		transition:
			background-color 120ms,
			color 120ms;
	}
	.tile:hover {
		color: var(--color-surface-900);
	}
	/* Status marker: a small bar along the bottom edge */
	.tile::after {
		content: '';
		position: absolute;
		inset-inline: 0.45rem;
		bottom: 0.2rem;
		height: 2px;
		border-radius: 1px;
		background-color: var(--color-surface-300);
	}
	.tile--live::after {
		background-color: var(--color-ok);
	}
	.tile--upcoming::after {
		background-color: #eab308;
		opacity: 0.8;
	}
	.tile--upcoming {
		color: var(--color-surface-400);
		background-color: transparent;
		box-shadow: inset 0 0 0 1px var(--color-surface-200);
	}
	.tile--live {
		box-shadow: inset 0 0 0 1.5px var(--color-ok);
	}
	.tile[aria-selected='true'] {
		color: #fff;
		background-color: var(--color-primary-600);
		box-shadow: none;
	}
	.tile[aria-selected='true']::after {
		background-color: rgb(255 255 255 / 0.75);
	}

	:global(.dark) .tile {
		color: var(--color-surface-300);
		background-color: rgb(255 255 255 / 0.06);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
	}
	:global(.dark) .tile:hover {
		color: #fff;
	}
	:global(.dark) .tile--upcoming {
		color: var(--color-surface-500);
		background-color: transparent;
	}
	:global(.dark) .tile--live {
		box-shadow: inset 0 0 0 1.5px var(--color-ok);
	}
	:global(.dark) .tile[aria-selected='true'] {
		color: #fff;
		background-color: var(--color-primary-600);
		box-shadow: none;
	}
</style>
