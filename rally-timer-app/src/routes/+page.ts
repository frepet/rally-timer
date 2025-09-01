import type { PageLoad } from './$types';

type Rally = { id: number; name: string };

export const load: PageLoad = async ({ fetch, url }) => {
  const rParam = url.searchParams.get('r');
  const rallyId = rParam ? Number(rParam) : null;

  const rallies: Rally[] = await fetch('/api/rally').then((r) => r.json());

  const effectiveId = rallyId ?? (rallies.length ? rallies[0].id : null);

  return {
    rallyId: effectiveId,
    rallies
  };
};
