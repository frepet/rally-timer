import { assertEventSelection } from '$lib/server/eventSelection';
import { requireHeatEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireHeatEvent(Number(event.params.id), true, sql);
		assertEventSelection(event.url, appEvent.id);
		const heatId = Number(event.params.id);
		if (!heatId) throw error(400, 'Invalid heat id');

		const [heat] = await sql<{ id: number; started_at: number | null }[]>`
		SELECT id, started_at FROM rallycross_heats WHERE id = ${heatId}
	`;
		if (!heat) throw error(404, 'Värmelopp hittades inte');
		if (heat.started_at !== null) throw error(409, 'Värmeloppet är redan startat');

		const [cfg] = await sql`SELECT gate_id FROM rallycross WHERE event_id = ${appEvent.id}`;
		if (!cfg?.gate_id) throw error(409, 'Assign a gate before starting');
		const active =
			await sql`SELECT id FROM rallycross_heats WHERE event_id = ${appEvent.id} AND started_at IS NOT NULL AND closed_at IS NULL`;
		if (active.length) throw error(409, 'Close the active heat first');
		const now = Date.now();
		await sql`UPDATE rallycross_heats SET started_at = ${now} WHERE id = ${heatId}`;
		await sql`UPDATE rallycross_heat_entries SET ts_ms = ${now} WHERE heat_id = ${heatId}`;
		await sql`UPDATE rallycross SET started_at = ${now} WHERE event_id = ${appEvent.id} AND started_at IS NULL`;

		return json({ started_at: now });
	});
}
