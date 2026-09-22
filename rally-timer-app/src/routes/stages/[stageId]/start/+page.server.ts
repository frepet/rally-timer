import { requireStageEvent } from '$lib/server/eventContext';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params }) => {
	const event = await requireStageEvent(Number(params.stageId));
	return { eventId: event.id };
};
