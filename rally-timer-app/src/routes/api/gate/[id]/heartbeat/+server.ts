import { json, error, type RequestEvent } from '@sveltejs/kit';

import { sql } from '../../../../../lib/server/db';
import { requireGateCrypto } from '../../../../../lib/server/gateAuth';
import { gateHeartbeats } from '../../../../../lib/server/metrics';

export async function POST(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	const [gate] = await sql<{ public_key: string | null; status: string }[]>`
		SELECT public_key, status FROM gates WHERE id = ${id}
	`;
	if (!gate) throw error(404, 'Gate not registered');

	await requireGateCrypto(event, gate, '');

	const now = Date.now();
	await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${id}`;
	gateHeartbeats.inc({ gate_id: id });

	return json({ ok: true });
}
