import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const heatId = Number(event.params.id);
	if (!heatId) throw error(400, 'Invalid heat id');

	const [heat] = await sql<{ id: number; started_at: number | null }[]>`
		SELECT id, started_at FROM rallycross_heats WHERE id = ${heatId}
	`;
	if (!heat) throw error(404, 'Värmelopp hittades inte');
	if (heat.started_at !== null) throw error(409, 'Värmeloppet är redan startat');

	const now = Date.now();
	await sql`UPDATE rallycross_heats SET started_at = ${now} WHERE id = ${heatId}`;
	await sql`UPDATE rallycross_heat_entries SET ts_ms = ${now} WHERE heat_id = ${heatId}`;
	await sql`UPDATE rallycross SET started_at = ${now} WHERE id = 1 AND started_at IS NULL`;

	return json({ started_at: now });
}
