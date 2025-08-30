import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  const rallyId = Number(params.rallyId);
  return { rallyId: Number.isFinite(rallyId) ? rallyId : 0 };
};
