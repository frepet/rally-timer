<nav class="nav">
	<a href="/">Home</a>
</nav>
<main>
	<slot />
</main>

<style>
	.nav {
		display: flex;
		gap: 1rem;
		padding: 0.75rem;
		border-bottom: 1px solid #444;
	}
	main {
		padding: 1rem;
	}
	a {
		text-decoration: none;
	}
</style>
