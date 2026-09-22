export type EventType = 'rally' | 'rallycross' | 'training';
export type AppEvent = {
	id: number;
	type: EventType;
	name: string;
	created_at: number;
	is_locked: boolean;
};

export function eventLockError(
	event: AppEvent,
	locked: boolean,
	hasAssignedGate = false
): string | null {
	if (event.type === 'training' && locked) return 'Training events cannot be locked';
	if (locked && hasAssignedGate) return 'Release all gates before locking';
	return null;
}

export function eventSubmissionError(
	event: AppEvent,
	closedStages: boolean[],
	hasAssignedGate: boolean
): string | null {
	if (event.type === 'training') return 'Training events cannot be submitted';
	if (event.is_locked) return 'Unlock this event before submitting again';
	if (closedStages.length === 0) return 'There are no stages or heats to submit';
	if (closedStages.some((closed) => !closed)) return 'Close every stage or heat before submitting';
	if (hasAssignedGate) return 'Release all gates before submitting';
	return null;
}

export function selectHomepageEvent(events: AppEvent[], pinnedId: number | null): AppEvent | null {
	const pinned = events.find((event) => event.id === pinnedId);
	if (pinned) return pinned;
	return events.reduce<AppEvent | null>(
		(latest, event) =>
			!latest ||
			event.created_at > latest.created_at ||
			(event.created_at === latest.created_at && event.id > latest.id)
				? event
				: latest,
		null
	);
}
