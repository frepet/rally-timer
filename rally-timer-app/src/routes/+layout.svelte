<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import {
		Button,
		DarkMode,
		Heading,
		Navbar,
		NavBrand,
		NavHamburger,
		NavLi,
		NavUl
	} from 'flowbite-svelte';
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
		<img src="/icon-white.png" alt="Rally Timer Logo" class="m-2 w-24 dark:block" />
		<Heading class="ml-2">Rally Timer</Heading>
	</NavBrand>

	<NavHamburger />
	<NavUl>
		<NavLi href="/">Results</NavLi>
		<NavLi href="/rallies">Manage Rallies</NavLi>
		<NavLi href="/drivers">Manage Drivers</NavLi>
		<NavLi href="/blipper">Blipper</NavLi>
		<DarkMode class="flex-1" />
	</NavUl>
</Navbar>
{#if $isAuthenticated}
	<Button onclick={logout}>Logout</Button>
	{#if $isAdmin}
		<p>✅ You are an admin!</p>
	{:else}
		<p>👋 Logged in, but not an admin.</p>
	{/if}
{:else}
	<Button onclick={login}>Login</Button>
{/if}
{@render children?.()}
