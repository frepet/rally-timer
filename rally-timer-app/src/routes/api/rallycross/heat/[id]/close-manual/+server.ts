import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';
import { heatManualCloseSchema } from '../../../../../../lib/server/schemas';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const heatId = Number(event.params.id);
	if (!heatId) throw error(400, 'Invalid heat id');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = heatManualCloseSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { finish_order } = parsed.data;

	const [heat] = await sql<{ id: number; started_at: number | null; closed_at: number | null }[]>`
		SELECT id, started_at, closed_at FROM rallycross_heats WHERE id = ${heatId}
	`;
	if (!heat) throw error(404, 'Värmelopp hittades inte');
	if (heat.started_at !== null) throw error(409, 'Startat värmelopp kan inte stängas manuellt');
	if (heat.closed_at !== null) throw error(409, 'Värmeloppet är redan stängt');

	const entryRows = await sql<{ driver_id: number }[]>`
		SELECT driver_id FROM rallycross_heat_entries WHERE heat_id = ${heatId}
	`;
	const heatDriverIds = new Set(entryRows.map((e) => e.driver_id));

	// Validate that all finish_order driver_ids are in this heat
	for (const driverId of finish_order) {
		if (!heatDriverIds.has(driverId)) throw error(400, `Driver ${driverId} is not in this heat`);
	}

	const finishedSet = new Set(finish_order);
	const now = Date.now();

	// Set manual_position for finishers
	for (let i = 0; i < finish_order.length; i++) {
		await sql`
			UPDATE rallycross_heat_entries
			SET manual_position = ${i + 1}
			WHERE heat_id = ${heatId} AND driver_id = ${finish_order[i]}
		`;
	}

	// Mark remaining entries as DNF
	for (const driverId of heatDriverIds) {
		if (!finishedSet.has(driverId)) {
			await sql`
				UPDATE rallycross_heat_entries
				SET dnf = true
				WHERE heat_id = ${heatId} AND driver_id = ${driverId}
			`;
		}
	}

	await sql`UPDATE rallycross_heats SET closed_at = ${now} WHERE id = ${heatId}`;
	await sql`UPDATE rallycross SET started_at = ${now} WHERE id = 1 AND started_at IS NULL`;

	return json({ closed_at: now });
}
