import { describe, expect, it } from 'vitest';
import {
	eventDeleteError,
	eventLockError,
	eventSubmissionError,
	selectHomepageEvent,
	trainingSubmissionError,
	type AppEvent
} from './events';
const event = (id: number, type: AppEvent['type'] = 'rally', created_at = id): AppEvent => ({
	id,
	type,
	name: `Event ${id}`,
	created_at,
	is_locked: false
});
describe('event lifecycle', () => {
	it('training uses its own submission flow instead of manual locking', () => {
		expect(eventLockError(event(1, 'training'), true)).toBeTruthy();
		expect(eventSubmissionError(event(1, 'training'), [], false)).toBeTruthy();
	});
	it('training submission requires laps and a released gate', () => {
		expect(trainingSubmissionError(event(1, 'training'), true, 2)).toBeTruthy();
		expect(trainingSubmissionError(event(1, 'training'), false, 0)).toBeTruthy();
		expect(trainingSubmissionError(event(1, 'training'), false, 2)).toBeNull();
	});
	it('training submission rejects locked and non-training events', () => {
		expect(
			trainingSubmissionError({ ...event(1, 'training'), is_locked: true }, false, 2)
		).toBeTruthy();
		expect(trainingSubmissionError(event(1, 'rally'), false, 2)).toBeTruthy();
	});
	it('submission requires closed stages and released gates', () => {
		expect(eventSubmissionError(event(1), [false], false)).toBeTruthy();
		expect(eventSubmissionError(event(1), [true], true)).toBeTruthy();
		expect(eventSubmissionError(event(1), [true, true], false)).toBeNull();
	});
	it('locked events cannot submit again until explicitly unlocked', () => {
		expect(eventSubmissionError({ ...event(1), is_locked: true }, [true], false)).toBeTruthy();
		expect(eventLockError({ ...event(1), is_locked: true }, false)).toBeNull();
	});
	it('empty events cannot submit', () =>
		expect(eventSubmissionError(event(1), [], false)).toBeTruthy());
});
describe('homepage selection', () => {
	it('honors selected event before creation time', () =>
		expect(selectHomepageEvent([event(1), event(2)], 1)?.id).toBe(1));
	it('uses newest event when unselected or selected event is absent', () => {
		expect(selectHomepageEvent([event(2), event(1), event(3)], null)?.id).toBe(3);
		expect(selectHomepageEvent([event(1), event(2)], 99)?.id).toBe(2);
	});
	it('breaks timestamp ties by id and handles empty lists', () => {
		expect(selectHomepageEvent([event(1, 'rally', 1), event(2, 'training', 1)], null)?.id).toBe(2);
		expect(selectHomepageEvent([], null)).toBeNull();
	});
});

it('manual locking requires releasing gates but permits an empty event', () => {
	expect(eventLockError(event(1), true, true)).toBeTruthy();
	expect(eventLockError(event(1), true, false)).toBeNull();
	expect(eventLockError(event(1), false, true)).toBeNull();
});
describe('event deletion', () => {
	it('allows deleting an unlocked event with no active gates', () =>
		expect(eventDeleteError(event(1), false)).toBeNull());
	it('requires unlocking first', () =>
		expect(eventDeleteError({ ...event(1), is_locked: true }, false)).toBeTruthy());
	it('requires gates to be released first', () =>
		expect(eventDeleteError(event(1), true)).toBeTruthy());
});
