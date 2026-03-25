import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';

export async function GET({ params }: RequestEvent) {
	const stageId = Number(params.id);
	const rows = await sql`
		SELECT * FROM (
			SELECT
				'start'  AS kind,
				se.id    AS id,
				se.ts_ms AS timestamp,
				d.name   AS driver_name,
				d.tag    AS tag
			FROM start_events se
			JOIN drivers d ON d.id = se.driver_id
			WHERE se.stage_id = ${stageId}

			UNION ALL

			SELECT
				'finish'       AS kind,
				fe.id          AS id,
				fe.timestamp   AS timestamp,
				NULL           AS driver_name,
				fe.tag         AS tag
			FROM finish_events fe
			WHERE fe.stage_id = ${stageId}
		) combined
		ORDER BY timestamp ASC, kind ASC, id ASC
	`;

	return json(rows);
}
