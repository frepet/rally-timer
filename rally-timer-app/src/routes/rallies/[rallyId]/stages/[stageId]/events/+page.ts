import type { RallyResponse } from '../../../../../../lib/types';
import type { PageLoad } from './$types';

// --- API helpers
async function fetchJSON<T>(fetch: any, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const load: PageLoad = async (event) => {
  const rallyId = Number(event.params.rallyId) ? event.params.rallyId : 0;
  const stageId = Number(event.params.stageId) ? event.params.stageId : 0;

  const bundle = await fetchJSON<RallyResponse>(event.fetch, `/api/rally/${rallyId}/bundle`);

  return {
    rallyId,
    stageId,
    bundle
  };
};
