import { error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function PUT(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;

	const [champ] = await sql`SELECT id FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	await sql`
		UPDATE settings SET default_championship_id =
			CASE WHEN default_championship_id = ${id}::uuid THEN NULL
			     ELSE ${id}::uuid
			END
		WHERE id = 1
	`;

	return new Response(null, { status: 204 });
}
