<script lang="ts">
	import { page } from '$app/state';
	import EventViewer from '$lib/EventViewer.svelte';
</script>

<EventViewer eventId={Number(page.params.id)} />
