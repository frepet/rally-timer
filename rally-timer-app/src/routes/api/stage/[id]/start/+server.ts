import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const stageId = Number(event.params.id);
	const { driver_id } = await event.request.json();
	if (!stageId || !driver_id)
		return json({ error: 'stageId & driver_id required' }, { status: 400 });

	const ts_ms = Date.now();

	const [row] = await sql`
		INSERT INTO start_events(stage_id, driver_id, ts_ms)
		VALUES(${stageId}, ${Number(driver_id)}, ${ts_ms})
		RETURNING id, stage_id, driver_id, ts_ms
	`;

	return json(row, { status: 201 });
}
