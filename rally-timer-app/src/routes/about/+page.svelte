<script lang="ts">
	import PageContent from '$lib/components/PageContent.svelte'
	let { data } = $props()
</script>

<PageContent slug={data.slug} content={data.content} html={data.html} />
