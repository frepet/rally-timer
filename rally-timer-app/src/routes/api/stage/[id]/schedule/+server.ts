import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { loadStartOrder } from '../../../../../lib/server/startOrderQuery';

export async function GET(event: RequestEvent): Promise<Response> {
	const stageId = Number(event.params.id);
	if (!Number.isInteger(stageId) || stageId <= 0) throw error(400, 'Invalid id');

	// `scheduled` is the authoritative sequence (past + future starts) every
	// client renders; `remaining` previews drivers not yet scheduled. Both are
	// public so passive display units (no admin login) can stay in sync.
	const [scheduled, remaining] = await Promise.all([
		sql`
			SELECT se.driver_id, se.ts_ms, d.name, c.id AS class_id, c.name AS class_name
			FROM start_events se
			JOIN drivers d ON d.id = se.driver_id AND d.active = true
			JOIN classes c ON c.id = d.class_id
			WHERE se.stage_id = ${stageId}
			ORDER BY se.ts_ms, d.name
		`,
		loadStartOrder(stageId)
	]);

	return json({
		server_now_ms: Date.now(),
		scheduled: scheduled.map((r) => ({
			driver_id: Number(r.driver_id),
			ts_ms: Number(r.ts_ms),
			name: r.name as string,
			class_id: Number(r.class_id),
			class_name: r.class_name as string
		})),
		remaining: remaining.map((d) => ({
			driver_id: d.id,
			name: d.name,
			class_id: d.class_id,
			class_name: d.class_name
		}))
	});
}
