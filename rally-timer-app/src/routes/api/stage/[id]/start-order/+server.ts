import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = Number(event.params.id);
	if (!Number.isFinite(id) || id <= 0) throw error(400, 'Invalid id');

	// Unranked drivers (no finished stage in rally) go first, sorted by class priority then name.
	// Ranked drivers follow, slowest total time first (inverse leaderboard).
	// When no one has a time yet (stage 1), everyone is unranked → class priority + alphabetical.
	const drivers = await sql`
		WITH ranked AS (
			SELECT driver_id, total_ms
			FROM rally_times
			WHERE total_ms IS NOT NULL
		)
		SELECT
			d.id,
			d.name,
			d.tag        AS rfid_tag,
			d.class_id,
			c.name       AS class_name
		FROM drivers d
		JOIN  classes c ON c.id = d.class_id
		LEFT JOIN ranked r ON r.driver_id = d.id
		WHERE d.active = true
		ORDER BY
			CASE WHEN r.total_ms IS NULL THEN 0 ELSE 1 END ASC,
			r.total_ms DESC,
			c.start_priority DESC,
			d.name ASC
	`;

	return json(drivers);
}
