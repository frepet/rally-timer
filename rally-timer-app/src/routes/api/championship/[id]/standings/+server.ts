import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { positionToPoints } from '../../../../../lib/domain/scoring';
import { calculateStandings } from '../../../../../lib/domain/standings';
import { rankRallyResultsByClass } from '../../../../../lib/domain/championshipRanking';
import { aggregateRallyResults, type RallyStageRow } from '../../../../../lib/domain/rallyResults';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [champ] = await sql`SELECT id FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	const rows = await sql`
		SELECT
			rr.rally_id,
			sr.name   AS rally_name,
			rr.driver_uuid,
			rr.driver_name,
			rr.class_id,
			rr.class_name,
			rr.elapsed_ms,
			rr.dnf
		FROM rally_results rr
		JOIN championship_rallies cr ON cr.rally_id = rr.rally_id
		JOIN submitted_rallies sr    ON sr.id = rr.rally_id
		WHERE cr.championship_id = ${id}::uuid
	`;

	const stageRows: RallyStageRow[] = rows.map((r) => ({
		rally_id: r.rally_id as string,
		rally_name: r.rally_name as string,
		driver_uuid: r.driver_uuid as string,
		driver_name: r.driver_name as string,
		class_id: Number(r.class_id),
		class_name: r.class_name as string,
		elapsed_ms: r.elapsed_ms === null ? null : Number(r.elapsed_ms),
		dnf: Boolean(r.dnf)
	}));

	const standings = calculateStandings(
		rankRallyResultsByClass(aggregateRallyResults(stageRows)).map((r) => ({
			rally_id: r.rally_id,
			rally_name: r.rally_name,
			driver_uuid: r.driver_uuid,
			driver_name: r.driver_name,
			class_id: r.class_id,
			class_name: r.class_name,
			position: r.position,
			total_ms: r.is_dnf ? null : r.total_ms
		})),
		positionToPoints
	);

	return json(standings);
}
