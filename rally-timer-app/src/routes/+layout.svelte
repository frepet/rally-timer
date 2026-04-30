<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { PUBLIC_BUILD_SHA } from '$env/static/public';
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
	import { initKeycloak, isAdmin, isAuthenticated, login, logout } from '../lib/stores/auth';
	import { kcFetch } from '../lib/kcFetch';

	let { children, data } = $props();

	let editingTitle = $state(false);
	let titleDraft = $state(data.title);
	let title = $state(data.title);
	let savingTitle = $state(false);

	onMount(async () => {
		initKeycloak();
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
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
</svelte:head>
<Navbar>
	<NavBrand href="/">
		<img src="/icon-black.png" alt="Rally Timer Logo" class="m-2 w-24 dark:hidden" />
		<img src="/icon-white.png" alt="Rally Timer Logo" class="m-2 hidden w-24 dark:block" />
		{#if editingTitle}
			<Input
				class="ml-2 w-80"
				bind:value={titleDraft}
				onkeydown={onTitleKeydown}
				disabled={savingTitle}
				autofocus
			/>
			<Button size="sm" class="ml-2" onclick={saveTitle} disabled={savingTitle}>Save</Button>
			<Button
				size="sm"
				color="alternative"
				class="ml-1"
				onclick={() => { titleDraft = title; editingTitle = false; }}
				disabled={savingTitle}
			>Cancel</Button>
		{:else}
			<Heading class="ml-2">{title}</Heading>
			{#if $isAdmin}
				<button
					class="ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
					onclick={(e) => { e.preventDefault(); e.stopPropagation(); titleDraft = title; editingTitle = true; }}
					aria-label="Edit title"
				>
					<EditOutline size="sm" />
				</button>
			{/if}
		{/if}
	</NavBrand>

	<NavHamburger />
	<NavUl>
		<NavLi href="/" class="text-gray-700 dark:text-gray-400">Results</NavLi>
		<NavLi href="/championships" class="text-gray-700 dark:text-gray-400">Championships</NavLi>
		<NavLi href="/rules" class="text-gray-700 dark:text-gray-400">Rules</NavLi>
		<NavLi href="/about" class="text-gray-700 dark:text-gray-400">About</NavLi>
		{#if $isAdmin}
			<NavLi>|</NavLi>
			<NavLi href="/rallies" class="text-gray-700 dark:text-gray-400">Rally</NavLi>
			<NavLi href="/drivers" class="text-gray-700 dark:text-gray-400">Drivers</NavLi>
			<NavLi href="/classes" class="text-gray-700 dark:text-gray-400">Classes</NavLi>
			<NavLi href="/gates" class="text-gray-700 dark:text-gray-400">Gates</NavLi>
		{/if}
		{#if $isAuthenticated}
			<Button onclick={logout}>Logout</Button>
		{:else}
			<Button onclick={login}>Login</Button>
		{/if}
		<DarkModeToggle />
	</NavUl>
</Navbar>
{@render children?.()}
<footer class="mt-8 pb-4 text-center text-xs text-gray-400 dark:text-gray-600">
	{PUBLIC_BUILD_SHA.startsWith('v') ? PUBLIC_BUILD_SHA : PUBLIC_BUILD_SHA.slice(0, 7)}
</footer>
