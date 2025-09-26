import type { RallyResponse } from '../../../../../../lib/types';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

interface EventsPageData {
	rallyId: number;
	stageId: number;
	bundle: RallyResponse;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// --- API helper (typed, throws SvelteKit error on failure)
async function fetchJSON<T>(fetchFn: Fetcher, url: string, init?: RequestInit): Promise<T> {
	const res = await fetchFn(url, init);
	if (!res.ok) {
		let body = '';
		try {
			body = await res.text();
		} catch {
			/* ignore */
		}
		throw error(res.status, body || `Request failed: ${res.status}`);
	}
	return (await res.json()) as T;
}

export const load: PageLoad<EventsPageData> = async (event) => {
	const rallyId = Number(event.params.rallyId) || 0;
	const stageId = Number(event.params.stageId) || 0;
	if (!rallyId || !stageId) throw error(400, 'Invalid rally or stage id');

	const bundle = await fetchJSON<RallyResponse>(event.fetch, `/api/rally/${rallyId}/bundle`);

	return {
		rallyId,
		stageId,
		bundle
	};
};
