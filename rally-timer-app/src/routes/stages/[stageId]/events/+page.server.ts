import { requireStageEvent } from '$lib/server/eventContext';
import type { BundleResponse } from '$lib/types';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, fetch }) => {
	const stageId = Number(params.stageId);
	const event = await requireStageEvent(stageId);
	const response = await fetch(`/api/bundle?event_id=${event.id}`);
	const bundle: BundleResponse = await response.json();
	return { stageId, eventId: event.id, bundle };
};
