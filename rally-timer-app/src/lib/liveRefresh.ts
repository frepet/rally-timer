/**
 * Live-refresh driver for result pages.
 *
 * Subscribes to the gate-event SSE stream and invokes `refresh` (debounced)
 * whenever a pass arrives, so times appear immediately. A slow fallback poll
 * still runs to pick up non-gate changes (manual edits by other admins) and
 * to recover if the stream drops.
 *
 * Returns a cleanup function.
 */
export function startLiveRefresh(refresh: () => void, fallbackMs = 10000): () => void {
	let debounce: ReturnType<typeof setTimeout> | null = null;
	const source = new EventSource('/api/gate-events/stream');
	source.onmessage = () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(refresh, 150);
	};
	const timer = setInterval(refresh, fallbackMs);
	return () => {
		source.close();
		clearInterval(timer);
		if (debounce) clearTimeout(debounce);
	};
}
