import { requireEvent } from '$lib/server/eventContext';
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { fetchClosedHeatResults } from '../../../../lib/server/rallycrossData';
import { buildOverallLeaderboard } from '../../../../lib/domain/rallycross';

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'rallycross');
	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE event_id = ${appEvent.id}
	`;

	const allHeatResults = await fetchClosedHeatResults(cfg, appEvent.id);
	if (allHeatResults.length === 0) return json([]);

	const overall = buildOverallLeaderboard(allHeatResults);

	const uuidMap = new Map(allHeatResults.map((r) => [r.driver_id, r.driver_uuid]));
	return json(overall.map((r) => ({ ...r, driver_uuid: uuidMap.get(r.driver_id) ?? '' })));
}
