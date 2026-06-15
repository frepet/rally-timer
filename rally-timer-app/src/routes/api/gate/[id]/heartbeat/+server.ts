import { json, error, type RequestEvent } from '@sveltejs/kit';

import { sql } from '../../../../../lib/server/db';
import { requireGateCrypto } from '../../../../../lib/server/gateAuth';

export async function POST(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	const [gate] = await sql<{ token: string | null; public_key: string | null; status: string }[]>`
		SELECT token, public_key, status FROM gates WHERE id = ${id}
	`;
	if (!gate) throw error(404, 'Gate not registered');

	await requireGateCrypto(event, gate, '');

	const now = Date.now();
	await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${id}`;

	return json({ ok: true });
}
