import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';
import { loadStartOrder } from '../../../../../lib/server/startOrderQuery';
import { nextClassBatch } from '../../../../../lib/domain/startOrder';
import { buildStartSchedule } from '../../../../../lib/domain/startSchedule';
import { emitStageFlow } from '../../../../../lib/server/stageFlow';
import { stageStartSchema } from '../../../../../lib/server/schemas';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const stageId = Number(event.params.id);
	if (!stageId) throw error(400, 'Invalid stage id');

	const parsed = stageStartSchema.safeParse(await event.request.json());
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });
	const { gap_seconds, lead_in_seconds, whole_class } = parsed.data;

	// Each press of Start schedules only the next class due to start (drivers
	// with no start_event yet, restricted to the highest-priority class among
	// them) so classes run one at a time: press Start, that class's drivers all
	// get a start_event, then the admin presses Start again for the next class.
	// `loadStartOrder` filters out drivers with an existing start_event, so
	// pressing Start twice (or two admins racing) schedules each driver at most
	// once.
	const order = nextClassBatch(await loadStartOrder(stageId));
	if (order.length === 0) return json({ scheduled: [] }, { status: 200 });

	const startAtMs = Date.now() + lead_in_seconds * 1000;
	const schedule = buildStartSchedule(order, startAtMs, gap_seconds * 1000, whole_class);

	const rows = await sql`
		INSERT INTO start_events ${sql(
			schedule.map((s) => ({ stage_id: stageId, driver_id: s.driver_id, ts_ms: s.ts_ms })),
			'stage_id',
			'driver_id',
			'ts_ms'
		)}
		RETURNING id, stage_id, driver_id, ts_ms
	`;

	await emitStageFlow({ stage_id: stageId, action: 'start' });

	return json({ scheduled: rows }, { status: 201 });
}
