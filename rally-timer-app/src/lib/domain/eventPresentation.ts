export { selectHomepageEvent as chooseHomepageEvent } from './events';
export type { AppEvent as DisplayEvent } from './events';
export function sortEvents<T extends { id: number; created_at: number }>(events: T[]): T[] {
	return [...events].sort((a, b) => b.created_at - a.created_at || b.id - a.id);
}
export function participantIdsAfterToggle(
	drivers: { id: number; active: boolean }[],
	id: number,
	active: boolean
): number[] {
	return drivers.filter((d) => (d.id === id ? active : d.active)).map((d) => d.id);
}
export function eventApiUrl(url: string, eventId: number): string {
	return `${url}${url.includes('?') ? '&' : '?'}event_id=${eventId}`;
}
export function availableEventGates<
	T extends { stage_id: number | null; assigned_event_id?: number | null }
>(gates: T[], eventId: number): T[] {
	return gates.filter(
		(g) => g.stage_id === null && (g.assigned_event_id == null || g.assigned_event_id === eventId)
	);
}

import { eventSubmissionError } from './events';
import type { AppEvent } from './events';
export function eventReadyToSubmit(
	stages: { closed_at?: number | null; is_closed?: boolean }[],
	hasGate: boolean
): boolean {
	const event: AppEvent = { id: 0, type: 'rally', name: '', created_at: 0, is_locked: false };
	return (
		eventSubmissionError(
			event,
			stages.map((s) => s.is_closed ?? s.closed_at != null),
			hasGate
		) === null
	);
}
