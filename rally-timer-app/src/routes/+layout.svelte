<script lang="ts">
	import '../app.css';
	import { DarkMode, Heading, Navbar, NavBrand, NavHamburger, NavLi, NavUl } from 'flowbite-svelte';

	let { children } = $props();
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
		<NavLi href="/rallies ">Rallies</NavLi>
		<NavLi href="/drivers">Drivers</NavLi>
		<NavLi href="/blipper">Blipper</NavLi>
		<DarkMode class="flex-1" />
	</NavUl>
</Navbar>
{@render children?.()}
