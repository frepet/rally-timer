import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [rally] =
		await sql`SELECT id, name, submitted_at FROM submitted_rallies WHERE id = ${id}::uuid`;
	if (!rally) throw error(404, 'Submitted rally not found');

	const [championships, results] = await Promise.all([
		sql`
			SELECT c.id, c.name
			FROM championship_rallies cr
			JOIN championships c ON c.id = cr.championship_id
			WHERE cr.rally_id = ${id}::uuid
			ORDER BY c.name
		`,
		sql`
			SELECT driver_uuid, driver_name, class_id, class_name, stage_name, elapsed_ms, dnf
			FROM rally_results
			WHERE rally_id = ${id}::uuid
			ORDER BY driver_name, stage_name
		`
	]);

	return json({ ...rally, championships, results });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;
	const result = await sql`DELETE FROM submitted_rallies WHERE id = ${id}::uuid`;
	if (result.count === 0) throw error(404, 'Submitted rally not found');
	return new Response(null, { status: 204 });
}
