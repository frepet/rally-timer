import { sql } from './db';
import type { DomainState } from './metrics';

export async function loadDomainState(): Promise<DomainState> {
	const gates = await sql<{ id: string; name: string | null; last_seen: string }[]>`
		SELECT id, name, last_seen FROM gates
	`;
	const events = await sql<{ type: string; is_locked: boolean; count: string }[]>`
		SELECT type, is_locked, count(*) AS count FROM events GROUP BY type, is_locked
	`;
	return {
		gates: gates.map((g) => ({ id: g.id, name: g.name, lastSeenMs: Number(g.last_seen) })),
		events: events.map((e) => ({ type: e.type, locked: e.is_locked, count: Number(e.count) }))
	};
}
