import { error } from '@sveltejs/kit';
/** A nested resource URL is sufficient, but an explicit parent must agree. */
export function assertEventSelection(url: URL, eventId: number): void {
	if (url.searchParams.has('event_id') && Number(url.searchParams.get('event_id')) !== eventId) {
		throw error(400, 'Resource does not belong to this event');
	}
}
