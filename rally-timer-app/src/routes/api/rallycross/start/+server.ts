import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	const [row] = await sql<{ gate_id: string | null }[]>`
		SELECT gate_id FROM rallycross WHERE id = 1
	`;
	if (!row?.gate_id) throw error(409, 'Tilldela en grind innan masstart');

	const now = Date.now();
	await sql`UPDATE rallycross SET started_at = ${now} WHERE id = 1`;
	return json({ started_at: now });
}
