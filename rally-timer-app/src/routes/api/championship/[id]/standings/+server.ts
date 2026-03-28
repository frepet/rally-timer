import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [champ] = await sql`SELECT id FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	const rows = await sql`
		WITH driver_totals AS (
			SELECT
				rr.rally_id,
				sr.name          AS rally_name,
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
		),
		ranked AS (
			SELECT *,
				ROW_NUMBER() OVER (
					PARTITION BY rally_id, class_id
					ORDER BY is_dnf ASC, total_ms ASC
				) AS pos
			FROM driver_totals
		),
		pts (pos, p) AS (
			VALUES (1,25),(2,18),(3,15),(4,12),(5,10),(6,8),(7,6),(8,4),(9,2),(10,1)
		),
		with_points AS (
			SELECT r.*, COALESCE(pt.p, 0) AS points
			FROM ranked r
			LEFT JOIN pts pt ON pt.pos = r.pos
		)
		SELECT
			driver_uuid,
			driver_name,
			class_id,
			class_name,
			SUM(points) AS total_points,
			json_agg(
				json_build_object(
					'rally_id',   rally_id,
					'rally_name', rally_name,
					'points',     points,
					'position',   pos
				) ORDER BY rally_id
			) AS rally_points
		FROM with_points
		GROUP BY driver_uuid, driver_name, class_id, class_name
		ORDER BY class_name, total_points DESC
	`;

	return json(rows);
}
