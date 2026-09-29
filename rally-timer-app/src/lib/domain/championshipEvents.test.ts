import { describe, expect, it } from 'vitest';
import { championshipRounds, type ChampionshipEvent } from './championshipEvents';

const event = (id: string, event_type: ChampionshipEvent['event_type']): ChampionshipEvent => ({
	id,
	name: id,
	submitted_at: 1,
	event_type
});

describe('championship event presentation', () => {
	it('keeps practices in the event list but excludes them from standings columns', () => {
		const events = [event('rally', 'rally'), event('practice', 'training')];
		expect(events).toHaveLength(2);
		expect(championshipRounds(events).map((entry) => entry.id)).toEqual(['rally']);
	});

	it('keeps rallycross rounds in standings', () => {
		expect(championshipRounds([event('rx', 'rallycross')])).toHaveLength(1);
	});
});
