import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { startEventCreateSchema } from '../../../lib/server/schemas';

// Create a single start_event. The stage start flow schedules the whole field
// via POST /api/stage/[id]/start; this collection endpoint is for inserting an
// individual start (manual correction / test fixtures) at an explicit time.
export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	const parsed = startEventCreateSchema.safeParse(await event.request.json());
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
	const { stage_id, driver_id, ts_ms } = parsed.data;

	const [row] = await sql`
		INSERT INTO start_events (stage_id, driver_id, ts_ms)
		VALUES (${stage_id}, ${driver_id}, ${ts_ms ?? Date.now()})
		RETURNING id, stage_id, driver_id, ts_ms
	`;

	return json(row, { status: 201 });
}
