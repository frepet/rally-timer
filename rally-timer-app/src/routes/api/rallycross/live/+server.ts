import { requireEvent } from '$lib/server/eventContext';
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { fetchLiveHeat } from '../../../../lib/server/rallycrossData';

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'rallycross');
	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE event_id = ${appEvent.id}
	`;
	const live = await fetchLiveHeat(cfg, appEvent.id);
	if (!live) return json({ heat: null, results: [] });
	return json({
		heat: {
			id: live.heat.id,
			number: live.heat.number,
			required_laps: live.heat.required_laps,
			started_at: Number(live.heat.started_at)
		},
		results: live.results
	});
}
