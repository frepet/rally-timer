<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { PUBLIC_BUILD_SHA } from '$env/static/public';
	import { page } from '$app/state';
	import {
		Button,
		Heading,
		Input,
		Navbar,
		NavBrand,
		NavHamburger,
		NavLi,
		NavUl
	} from 'flowbite-svelte';
	import { EditOutline } from 'flowbite-svelte-icons';
	import DarkModeToggle from '../lib/components/DarkModeToggle.svelte';
	import LanguageSwitcher from '../lib/components/LanguageSwitcher.svelte';
	import { untrack } from 'svelte';
	import { initKeycloak, isAdmin, isAuthenticated, login, logout } from '../lib/stores/auth';
	import { kcFetch } from '../lib/kcFetch';
	import { initLocale, t } from '../lib/stores/locale.svelte';

	let { children, data } = $props();

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

	function navClass(href: string, exact = false): string {
		const active = exact ? pathname === href : pathname.startsWith(href);
		return active ? 'text-primary-600 dark:!text-primary-500' : 'text-gray-700 dark:!text-gray-300';
	}
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
</svelte:head>
<Navbar>
	<NavBrand href="/">
		<img src="/icon-black.png" alt={t.logoAlt} class="m-2 w-24 dark:hidden" />
		<img src="/icon-white.png" alt={t.logoAlt} class="m-2 hidden w-24 dark:block" />
		{#if editingTitle}
			<Input
				class="ml-2 w-80"
				bind:value={titleDraft}
				onkeydown={onTitleKeydown}
				disabled={savingTitle}
				autofocus
			/>
			<Button size="sm" class="ml-2" onclick={saveTitle} disabled={savingTitle}>{t.save}</Button>
			<Button
				size="sm"
				color="alternative"
				class="ml-1"
				onclick={() => {
					titleDraft = title;
					editingTitle = false;
				}}
				disabled={savingTitle}>{t.cancel}</Button
			>
		{:else}
			<Heading class="small-caps ml-2">{title}</Heading>
			{#if $isAdmin}
				<button
					class="ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						titleDraft = title;
						editingTitle = true;
					}}
					aria-label={t.editTitle}
				>
					<EditOutline size="sm" />
				</button>
			{/if}
		{/if}
	</NavBrand>

	<NavHamburger />
	<NavUl>
		<NavLi href="/" class={navClass('/', true)}>{t.navResults}</NavLi>
		<NavLi href="/championships" class={navClass('/championships')}>{t.navChampionships}</NavLi>
		<NavLi href="/rules" class={navClass('/rules')}>{t.navRules}</NavLi>
		<NavLi href="/about" class={navClass('/about')}>{t.navAbout}</NavLi>
		{#if $isAdmin}
			<NavLi>|</NavLi>
			<NavLi href="/rallies" class={navClass('/rallies')}>Rally</NavLi>
			<NavLi href="/drivers" class={navClass('/drivers')}>{t.navDrivers}</NavLi>
			<NavLi href="/classes" class={navClass('/classes')}>{t.navClasses}</NavLi>
			<NavLi href="/gates" class={navClass('/gates')}>{t.navGates}</NavLi>
		{/if}
		{#if $isAuthenticated}
			<Button color="alternative" onclick={logout} class="p-1">{t.logout}</Button>
		{:else}
			<Button color="alternative" onclick={login} class="p-1">{t.login}</Button>
		{/if}
		<LanguageSwitcher />
		<DarkModeToggle />
	</NavUl>
</Navbar>
{@render children?.()}
<footer class="mt-8 pb-4 text-center text-xs text-gray-400 dark:text-gray-600">
	{PUBLIC_BUILD_SHA.startsWith('v') ? PUBLIC_BUILD_SHA : PUBLIC_BUILD_SHA.slice(0, 7)}
</footer>
