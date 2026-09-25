import { describe, expect, it } from 'vitest';
import {
	chooseHomepageEvent,
	filterEvents,
	sortEvents,
	participantIdsAfterToggle,
	eventApiUrl
} from './eventPresentation';
const events = [
	{ id: 1, created_at: 10, name: 'A', type: 'rally' as const, is_locked: false },
	{ id: 2, created_at: 20, name: 'B', type: 'rally' as const, is_locked: false }
];
describe('event presentation', () => {
	it('uses selected homepage event and otherwise newest without mutating input', () => {
		expect(chooseHomepageEvent(events, 1)?.id).toBe(1);
		expect(chooseHomepageEvent(events, 99)?.id).toBe(2);
		expect(chooseHomepageEvent([], null)).toBeNull();
		expect(sortEvents(events).map((e) => e.id)).toEqual([2, 1]);
		expect(events[0].id).toBe(1);
	});
	it('updates only event participant selection', () => {
		const drivers = [
			{ id: 1, active: true },
			{ id: 2, active: false }
		];
		expect(participantIdsAfterToggle(drivers, 2, true)).toEqual([1, 2]);
		expect(participantIdsAfterToggle(drivers, 1, false)).toEqual([]);
		expect(drivers[1].active).toBe(false);
	});
	it('scopes API requests and preserves existing query parameters', () => {
		expect(eventApiUrl('/api/bundle', 2)).toBe('/api/bundle?event_id=2');
		expect(eventApiUrl('/api/stage?x=1', 3)).toBe('/api/stage?x=1&event_id=3');
	});
	it('filters events by name without changing their order', () => {
		const list = [
			{ ...events[0], name: 'Höstrallyt' },
			{ ...events[1], name: 'Rallycross Knutby' }
		];
		expect(filterEvents(list, ' rally ')).toEqual(list);
		expect(filterEvents(list, 'KNUTBY').map((event) => event.id)).toEqual([2]);
		expect(filterEvents(list, '')).toBe(list);
	});
});

import { availableEventGates } from './eventPresentation';
it('hides gates claimed by another event while preserving own selected gate', () => {
	const gates = [
		{ id: 'a', stage_id: null, assigned_event_id: 1 },
		{ id: 'b', stage_id: null, assigned_event_id: 2 },
		{ id: 'c', stage_id: 3, assigned_event_id: 1 },
		{ id: 'd', stage_id: null, assigned_event_id: null }
	];
	expect(availableEventGates(gates, 1).map((g) => g.id)).toEqual(['a', 'd']);
});

import { eventReadyToSubmit } from './eventPresentation';
it('only offers submission after every stage closes and all event gates release', () => {
	expect(eventReadyToSubmit([], false)).toBe(false);
	expect(eventReadyToSubmit([{ closed_at: null }], false)).toBe(false);
	expect(eventReadyToSubmit([{ closed_at: 10 }], true)).toBe(false);
	expect(eventReadyToSubmit([{ closed_at: 10 }], false)).toBe(true);
});
