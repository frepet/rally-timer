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
	const driverUuids = [...uuidMap.values()];

	// Rating each driver had before this event: the stored "before" once the event is
	// submitted, otherwise their current rating (ratings only change on submission).
	const currentRatings = await sql<{ uuid: string; rating: number }[]>`
		SELECT uuid::text AS uuid, rating FROM drivers WHERE uuid = ANY(${driverUuids}::uuid[])
	`;
	const submittedBefore = await sql<{ uuid: string; rating_before: number }[]>`
		SELECT rdr.driver_uuid::text AS uuid, rdr.rating_before
		FROM rally_driver_ratings rdr
		JOIN submitted_rallies sr ON sr.id = rdr.rally_id
		WHERE sr.event_id = ${appEvent.id}
	`;
	const ratingBefore = new Map(currentRatings.map((r) => [r.uuid, Number(r.rating)]));
	for (const r of submittedBefore) ratingBefore.set(r.uuid, Number(r.rating_before));

	return json(
		overall.map((r) => {
			const driver_uuid = uuidMap.get(r.driver_id) ?? '';
			return { ...r, driver_uuid, rating_before: ratingBefore.get(driver_uuid) ?? null };
		})
	);
}
