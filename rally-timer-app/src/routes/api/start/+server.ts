import { assertEventSelection } from '$lib/server/eventSelection';
import { requireStageEvent } from '$lib/server/eventContext';
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { startEventCreateSchema } from '../../../lib/server/schemas';

// Create a single start_event. The stage start flow schedules the whole field
// via POST /api/stage/[id]/start; this collection endpoint is for inserting an
// individual start (manual correction / test fixtures) at an explicit time.
export async function POST(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);

		const parsed = startEventCreateSchema.safeParse(await event.request.json());
		if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
		const { stage_id, driver_id, ts_ms } = parsed.data;
		const appEvent = await requireStageEvent(stage_id, true, sql);
		assertEventSelection(event.url, appEvent.id);
		const [participant] =
			await sql`SELECT driver_id FROM event_participants WHERE event_id = ${appEvent.id} AND driver_id = ${driver_id}`;
		if (!participant) return json({ error: 'Driver is not an event participant' }, { status: 400 });

		const [row] = await sql`
		INSERT INTO start_events (stage_id, driver_id, ts_ms)
		VALUES (${stage_id}, ${driver_id}, ${ts_ms ?? Date.now()})
		RETURNING id, stage_id, driver_id, ts_ms
	`;

		return json(row, { status: 201 });
	});
}
