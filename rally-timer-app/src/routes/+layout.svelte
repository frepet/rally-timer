<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import {
		Button,
		Heading,
		Navbar,
		NavBrand,
		NavHamburger,
		NavLi,
		NavUl
	} from 'flowbite-svelte';
	import DarkModeToggle from '../lib/components/DarkModeToggle.svelte';
	import { initKeycloak, isAdmin, isAuthenticated, login, logout } from '../lib/stores/auth';

	let { children } = $props();

	onMount(async () => {
		initKeycloak();
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
</svelte:head>
<Navbar>
	<NavBrand href="/">
		<img src="/icon-black.png" alt="Rally Timer Logo" class="m-2 w-24 dark:hidden" />
		<img src="/icon-white.png" alt="Rally Timer Logo" class="m-2 hidden w-24 dark:block" />
		<Heading class="ml-2">AC/RC - Västerbotten RC Rally</Heading>
	</NavBrand>

	<NavHamburger />
	<NavUl>
		<NavLi href="/" class="text-gray-700 dark:text-gray-400">Results</NavLi>
		<NavLi href="/championships" class="text-gray-700 dark:text-gray-400">Championships</NavLi>
		<NavLi href="/rules" class="text-gray-700 dark:text-gray-400">Rules</NavLi>
		<NavLi href="/about" class="text-gray-700 dark:text-gray-400">About</NavLi>
		{#if $isAdmin}
			<NavLi>|</NavLi>
			<NavLi href="/rallies" class="text-gray-700 dark:text-gray-400">Manage</NavLi>
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
