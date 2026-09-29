export type ChampionshipEvent = {
	id: string;
	name: string;
	submitted_at: number;
	event_type: 'rally' | 'rallycross' | 'training';
};

export function championshipRounds(events: ChampionshipEvent[]): ChampionshipEvent[] {
	return events.filter((event) => event.event_type !== 'training');
}
