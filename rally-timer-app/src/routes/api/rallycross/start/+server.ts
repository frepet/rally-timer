import { requireMutableEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'rallycross', sql);

		const [row] = await sql<{ gate_id: string | null }[]>`
		SELECT gate_id FROM rallycross WHERE event_id = ${appEvent.id}
	`;
		if (!row?.gate_id) throw error(409, 'Tilldela en grind innan masstart');

		const now = Date.now();
		await sql`UPDATE rallycross SET started_at = ${now} WHERE event_id = ${appEvent.id}`;
		return json({ started_at: now });
	});
}
