import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const gate = params.gate!;
  const r = await fetch(`/api/passes/${encodeURIComponent(gate)}`);
  const initial = r.ok ? await r.json() : [];
  return { gate, initial };
};
