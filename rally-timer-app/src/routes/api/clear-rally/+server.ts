import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	await sql.begin(async (tx) => {
		const tsql = tx as unknown as typeof sql;
		await tsql`UPDATE gates SET stage_id = NULL`;
		await tsql`DELETE FROM stages`;
	});
	return json({ cleared: true });
}
