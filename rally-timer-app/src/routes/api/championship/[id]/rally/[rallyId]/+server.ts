import { error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const { id, rallyId } = event.params;
	const result = await sql`
		DELETE FROM championship_rallies
		WHERE championship_id = ${id!}::uuid AND rally_id = ${rallyId!}::uuid
	`;
	if (result.count === 0) throw error(404, 'Rally not found in this championship');
	return new Response(null, { status: 204 });
}
