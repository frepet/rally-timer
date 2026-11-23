import {
	family,
	renderCounters,
	renderDomainState,
	renderHistograms,
	renderMetrics,
	snapshotProcess
} from '$lib/server/metrics';
import { loadDomainState } from '$lib/server/metricsDb';

const DB_TIMEOUT_MS = 5000;

// Scraped by Prometheus (ServiceMonitor in fph-cluster). A database failure
// must not fail the scrape: `up` means the app and its mesh path work, and
// rally_timer_db_up reports Postgres separately.
export async function GET(): Promise<Response> {
	let body = renderMetrics(snapshotProcess()) + renderCounters() + renderHistograms();
	try {
		const state = await Promise.race([
			loadDomainState(),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS).unref()
			)
		]);
		body +=
			renderDomainState(state) +
			family('rally_timer_db_up', 'gauge', 'Postgres reachable.', [{ value: 1 }]);
	} catch {
		body += family('rally_timer_db_up', 'gauge', 'Postgres reachable.', [{ value: 0 }]);
	}
	return new Response(body, {
		headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }
	});
}
