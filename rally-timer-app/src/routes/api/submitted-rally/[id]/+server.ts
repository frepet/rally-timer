import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [rally] =
		await sql`SELECT id, name, submitted_at FROM submitted_rallies WHERE id = ${id}::uuid`;
	if (!rally) throw error(404, 'Submitted rally not found');

	const [championships, results, driverRatings] = await Promise.all([
		sql`
			SELECT c.id, c.name
			FROM championship_rallies cr
			JOIN championships c ON c.id = cr.championship_id
			WHERE cr.rally_id = ${id}::uuid
			ORDER BY c.name
		`,
		sql`
			SELECT driver_uuid, driver_name, class_id, class_name, stage_name, stage_order, elapsed_ms, best_lap_ms, dnf
			FROM rally_results
			WHERE rally_id = ${id}::uuid
			ORDER BY driver_name, stage_name
		`,
		sql`
			SELECT DISTINCT rdr.driver_uuid::text, rr.driver_name, rdr.rating_before, rdr.rating_after
			FROM rally_driver_ratings rdr
			JOIN rally_results rr
				ON rr.rally_id = rdr.rally_id AND rr.driver_uuid = rdr.driver_uuid
			WHERE rdr.rally_id = ${id}::uuid
		`
	]);

	return json({
		...rally,
		submitted_at: Number(rally.submitted_at),
		championships,
		results: results.map((r) => ({
			...r,
			elapsed_ms: r.elapsed_ms != null ? Number(r.elapsed_ms) : null,
			best_lap_ms: r.best_lap_ms != null ? Number(r.best_lap_ms) : null
		})),
		driver_ratings: driverRatings.map((r) => ({
			driver_uuid: r.driver_uuid as string,
			driver_name: r.driver_name as string,
			rating_before: r.rating_before as number,
			rating_after: r.rating_after as number
		}))
	});
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;
	const result = await sql`DELETE FROM submitted_rallies WHERE id = ${id}::uuid`;
	if (result.count === 0) throw error(404, 'Submitted rally not found');
	return new Response(null, { status: 204 });
}
