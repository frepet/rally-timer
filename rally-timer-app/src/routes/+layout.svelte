<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { env } from '$env/dynamic/public';
	import { page } from '$app/state';
	import { Button, Input } from 'flowbite-svelte';
	import { BarsOutline, CloseOutline, EditOutline } from 'flowbite-svelte-icons';
	import DarkModeToggle from '../lib/components/DarkModeToggle.svelte';
	import LanguageSwitcher from '../lib/components/LanguageSwitcher.svelte';
	import { untrack } from 'svelte';
	import { auth, initKeycloak, login, logout } from '../lib/stores/auth.svelte';
	import { kcFetch } from '../lib/kcFetch';
	import { initLocale, t } from '../lib/stores/locale.svelte';

	let { children, data } = $props();

	const buildSha = env.PUBLIC_BUILD_SHA ?? 'dev';

	let editingTitle = $state(false);
	let titleDraft = $state(untrack(() => data.title));
	let title = $state(untrack(() => data.title));
	let savingTitle = $state(false);

	// Re-sync when layout data refreshes on navigation
	$effect(() => {
		const latest = data.title;
		untrack(() => {
			if (!editingTitle) {
				title = latest;
				titleDraft = latest;
			}
		});
	});

	onMount(async () => {
		initKeycloak();
		initLocale();
	});

	async function saveTitle() {
		savingTitle = true;
		try {
			const res = await kcFetch('/api/page/title', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: titleDraft })
			});
			if (!res.ok) throw new Error(await res.text());
			title = titleDraft;
			editingTitle = false;
		} finally {
			savingTitle = false;
		}
	}

	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveTitle();
		if (e.key === 'Escape') {
			titleDraft = title;
			editingTitle = false;
		}
	}

	const pathname = $derived(page.url.pathname);

	let menuOpen = $state(false);

	// Close the mobile menu whenever the route changes
	$effect(() => {
		void pathname;
		untrack(() => (menuOpen = false));
	});

	function isActive(href: string, exact = false): boolean {
		return exact ? pathname === href : pathname.startsWith(href);
	}

	const publicLinks = $derived([
		{ href: '/', label: t.navResults, exact: true },
		{ href: '/events', label: t.navEvents, exact: false },
		{ href: '/championships', label: t.navChampionships, exact: false },
		{ href: '/drivers', label: t.navDrivers, exact: false },
		{ href: '/rules', label: t.navRules, exact: false },
		{ href: '/about', label: t.navAbout, exact: false }
	]);
	const adminLinks = $derived([
		{ href: '/classes', label: t.navClasses, exact: false },
		{ href: '/gates', label: t.navGates, exact: false }
	]);
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
</svelte:head>

{#snippet navLink(link: { href: string; label: string; exact: boolean })}
	<a
		href={link.href}
		class="nav-link"
		aria-current={isActive(link.href, link.exact) ? 'page' : undefined}>{link.label}</a
	>
{/snippet}

<header
	class="sticky top-0 z-40 border-b border-surface-200/80 bg-white/85 backdrop-blur-md dark:border-white/8 dark:bg-surface-900/85"
>
	<!-- Checkered accent strip -->
	<div class="checker h-2" aria-hidden="true"></div>
	<div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
		<div class="flex min-w-0 items-center gap-3">
			<a href="/" class="shrink-0" aria-label={title}>
				<img src="/icon-black.png" alt={t.logoAlt} class="h-11 w-auto dark:hidden" />
				<img src="/icon-white.png" alt={t.logoAlt} class="hidden h-11 w-auto dark:block" />
			</a>
			{#if editingTitle}
				<div class="flex items-center gap-1.5">
					<Input
						class="w-40 sm:w-64"
						size="sm"
						bind:value={titleDraft}
						onkeydown={onTitleKeydown}
						disabled={savingTitle}
						autofocus
					/>
					<Button size="xs" onclick={saveTitle} disabled={savingTitle}>{t.save}</Button>
					<Button
						size="xs"
						color="alternative"
						onclick={() => {
							titleDraft = title;
							editingTitle = false;
						}}
						disabled={savingTitle}>{t.cancel}</Button
					>
				</div>
			{:else}
				<a
					href="/"
					class="truncate text-2xl leading-none font-bold tracking-wide text-surface-900 uppercase dark:text-white"
					style="font-family: var(--font-display)">{title}</a
				>
				{#if auth.isAdmin}
					<button
						class="shrink-0 rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-800 dark:hover:bg-white/10 dark:hover:text-surface-100"
						onclick={() => {
							titleDraft = title;
							editingTitle = true;
						}}
						aria-label={t.editTitle}
					>
						<EditOutline size="sm" />
					</button>
				{/if}
			{/if}
		</div>

		<nav class="ml-auto hidden items-center gap-0.5 lg:flex">
			{#each publicLinks as link (link.href)}{@render navLink(link)}{/each}
			{#if auth.isAdmin}
				<span class="mx-2 h-5 w-px bg-surface-200 dark:bg-white/10" aria-hidden="true"></span>
				{#each adminLinks as link (link.href)}{@render navLink(link)}{/each}
			{/if}
		</nav>

		<div class="ml-auto flex items-center gap-1 lg:ml-3">
			<div class="hidden items-center gap-1 sm:flex">
				<LanguageSwitcher />
				<DarkModeToggle />
			</div>
			{#if auth.isAuthenticated}
				<Button color="alternative" size="xs" onclick={logout} class="hidden sm:inline-flex"
					>{t.logout}</Button
				>
			{:else}
				<Button color="alternative" size="xs" onclick={login} class="hidden sm:inline-flex"
					>{t.login}</Button
				>
			{/if}
			<button
				type="button"
				class="rounded-lg p-2 text-surface-600 hover:bg-surface-100 lg:hidden dark:text-surface-300 dark:hover:bg-white/10"
				aria-label={t.toggleMenu}
				aria-expanded={menuOpen}
				aria-controls="mobile-menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				{#if menuOpen}<CloseOutline />{:else}<BarsOutline />{/if}
			</button>
		</div>
	</div>

	{#if menuOpen}
		<nav
			id="mobile-menu"
			class="border-t border-surface-200 px-4 pt-2 pb-4 lg:hidden dark:border-white/8"
		>
			<div class="grid gap-0.5">
				{#each publicLinks as link (link.href)}{@render navLink(link)}{/each}
				{#if auth.isAdmin}
					<p class="eyebrow mt-3 mb-1 px-3">{t.navAdmin}</p>
					{#each adminLinks as link (link.href)}{@render navLink(link)}{/each}
				{/if}
			</div>
			<div
				class="mt-3 flex items-center justify-between border-t border-surface-200 pt-3 dark:border-white/8"
			>
				<div class="flex items-center gap-1">
					<LanguageSwitcher />
					<DarkModeToggle />
				</div>
				{#if auth.isAuthenticated}
					<Button color="alternative" size="xs" onclick={logout}>{t.logout}</Button>
				{:else}
					<Button color="alternative" size="xs" onclick={login}>{t.login}</Button>
				{/if}
			</div>
		</nav>
	{/if}
</header>

<main class="flex-1">
	{@render children?.()}
</main>

<footer
	class="mt-10 border-t border-surface-200 py-5 text-center text-xs text-surface-400 dark:border-white/8 dark:text-surface-500"
>
	<span class="font-mono">{buildSha.startsWith('v') ? buildSha : buildSha.slice(0, 7)}</span>
</footer>

<style>
	.checker {
		background-color: #fff;
		background-image:
			linear-gradient(45deg, #111 25%, transparent 25%, transparent 75%, #111 75%),
			linear-gradient(45deg, #111 25%, transparent 25%, transparent 75%, #111 75%);
		background-size: 8px 8px;
		background-position:
			0 0,
			4px 4px;
	}
	:global(.dark) .checker {
		opacity: 0.55;
	}
	.nav-link {
		border-radius: 0.5rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-surface-600);
		transition:
			color 120ms,
			background-color 120ms;
	}
	.nav-link:hover {
		color: var(--color-surface-900);
		background-color: var(--color-surface-100);
	}
	.nav-link[aria-current='page'] {
		color: var(--color-primary-700);
		background-color: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
	}
	:global(.dark) .nav-link {
		color: var(--color-surface-300);
	}
	:global(.dark) .nav-link:hover {
		color: #fff;
		background-color: rgb(255 255 255 / 0.08);
	}
	:global(.dark) .nav-link[aria-current='page'] {
		color: var(--color-primary-500);
		background-color: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
	}
</style>
