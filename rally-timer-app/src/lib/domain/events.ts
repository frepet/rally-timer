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
	if (event.type === 'training' && locked)
		return 'Training events can only be locked by submission';
	if (locked && hasAssignedGate) return 'Release all gates before locking';
	return null;
}

export function trainingSubmissionError(
	event: AppEvent,
	hasAssignedGate: boolean,
	lapCount: number
): string | null {
	if (event.type !== 'training') return 'Only training events can be submitted here';
	if (event.is_locked) return 'This training event has already been submitted';
	if (hasAssignedGate) return 'Release the gate before submitting';
	if (lapCount === 0) return 'There are no completed laps to submit';
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

// Deleting cascades to stages, heats, participants and timing data; submitted
// championship results survive (their event_id is set to NULL).
export function eventDeleteError(event: AppEvent, hasAssignedGate: boolean): string | null {
	if (event.is_locked) return 'Unlock the event before deleting it';
	if (hasAssignedGate) return 'Release all gates before deleting';
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
