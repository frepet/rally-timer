import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';
import { computeStartOrder, type StartOrderDriver } from '../../../../../lib/domain/startOrder';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = Number(event.params.id);
	if (!Number.isFinite(id) || id <= 0) throw error(400, 'Invalid id');

	const rows = await sql`
		SELECT
			d.id,
			d.name,
			d.tag                 AS rfid_tag,
			d.class_id,
			c.name                AS class_name,
			c.start_priority      AS class_start_priority,
			r.total_ms            AS total_ms
		FROM drivers d
		JOIN classes c ON c.id = d.class_id
		LEFT JOIN rally_times r ON r.driver_id = d.id
		WHERE d.active = true
	`;

	const drivers: StartOrderDriver[] = rows.map((r) => ({
		id: Number(r.id),
		name: r.name,
		rfid_tag: r.rfid_tag,
		class_id: Number(r.class_id),
		class_name: r.class_name,
		class_start_priority: Number(r.class_start_priority),
		total_ms: r.total_ms === null ? null : Number(r.total_ms)
	}));

	return json(computeStartOrder(drivers));
}
