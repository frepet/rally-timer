import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { positionToPoints } from '../../../../../lib/domain/scoring';
import { calculateStandings } from '../../../../../lib/domain/standings';
import {
	rankRallyResultsByClass,
	type RallyClassResult
} from '../../../../../lib/domain/championshipRanking';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [champ] = await sql`SELECT id FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	const rows = await sql`
		SELECT
			rr.rally_id,
			sr.name                         AS rally_name,
			rr.driver_uuid,
			rr.driver_name,
			rr.class_id,
			rr.class_name,
			SUM(rr.elapsed_ms)              AS total_ms,
			bool_or(rr.elapsed_ms IS NULL)  AS is_dnf
		FROM rally_results rr
		JOIN championship_rallies cr ON cr.rally_id = rr.rally_id
		JOIN submitted_rallies sr    ON sr.id = rr.rally_id
		WHERE cr.championship_id = ${id}::uuid
		GROUP BY rr.rally_id, sr.name, rr.driver_uuid, rr.driver_name, rr.class_id, rr.class_name
	`;

	const rallyResults: RallyClassResult[] = rows.map((r) => ({
		rally_id: r.rally_id as string,
		rally_name: r.rally_name as string,
		driver_uuid: r.driver_uuid as string,
		driver_name: r.driver_name as string,
		class_id: Number(r.class_id),
		class_name: r.class_name as string,
		total_ms: r.total_ms === null ? 0 : Number(r.total_ms),
		is_dnf: r.is_dnf as boolean
	}));

	const standings = calculateStandings(
		rankRallyResultsByClass(rallyResults).map((r) => ({
			rally_id: r.rally_id,
			rally_name: r.rally_name,
			driver_uuid: r.driver_uuid,
			driver_name: r.driver_name,
			class_id: r.class_id,
			class_name: r.class_name,
			position: r.position
		})),
		positionToPoints
	);

	return json(standings);
}
