import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	await sql`UPDATE gates SET stage_id = NULL`;
	await sql`DELETE FROM stages`;
	return json({ cleared: true });
}
