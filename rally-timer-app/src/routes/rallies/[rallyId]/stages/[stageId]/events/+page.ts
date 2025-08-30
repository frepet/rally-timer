import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  const rallyId = Number(params.rallyId);
  const stageId = Number(params.stageId);
  return {
    rallyId: Number.isFinite(rallyId) ? rallyId : 0,
    stageId: Number.isFinite(stageId) ? stageId : 0
  };
};
