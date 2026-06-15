/**
 * Live-refresh driver for result pages.
 *
 * Subscribes to the gate-event SSE stream and invokes `refresh` (debounced)
 * whenever a pass arrives, so times appear immediately. A slow fallback poll
 * still runs to pick up non-gate changes (manual edits by other admins) and
 * to recover if the stream drops.
 *
 * Refreshes are serialised: if one is still in flight when another is
 * triggered, a single follow-up run is coalesced afterwards. This prevents the
 * debounce and the fallback poll from issuing overlapping fetches whose
 * responses could resolve out of order and clobber fresh state with stale data.
 *
 * Returns a cleanup function.
 */
export function startLiveRefresh(
	refresh: () => void | Promise<void>,
	fallbackMs = 10000
): () => void {
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let pending = false;
	let closed = false;

	async function run() {
		if (running) {
			pending = true;
			return;
		}
		running = true;
		try {
			do {
				pending = false;
				await refresh();
			} while (pending && !closed);
		} finally {
			running = false;
		}
	}

	const source = new EventSource('/api/gate-events/stream');
	source.onmessage = () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(run, 150);
	};
	const timer = setInterval(run, fallbackMs);

	return () => {
		closed = true;
		source.close();
		clearInterval(timer);
		if (debounce) clearTimeout(debounce);
	};
}
