<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { DarkMode, Heading, Navbar, NavBrand, NavHamburger, NavLi, NavUl } from 'flowbite-svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<Navbar>
	<NavBrand href="/">
		<Heading>Rally Timer</Heading>
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
