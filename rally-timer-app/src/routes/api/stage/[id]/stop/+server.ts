import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';
import { emitStageFlow } from '../../../../../lib/server/stageFlow';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const stageId = Number(event.params.id);
	if (!stageId) throw error(400, 'Invalid stage id');

	const now = Date.now();

	// Remove every not-yet-started driver (scheduled in the future). Drivers
	// whose start time has already passed keep their start_event. Removed
	// drivers re-enter the start order automatically (no start_event anymore).
	const removed = await sql`
		DELETE FROM start_events
		WHERE stage_id = ${stageId} AND ts_ms > ${now}
		RETURNING id
	`;

	await emitStageFlow({ stage_id: stageId, action: 'stop' });

	return json({ removed: removed.length }, { status: 200 });
}
