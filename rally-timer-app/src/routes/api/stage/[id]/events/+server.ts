import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { db } from '../../../../../lib/server/db';

export async function GET({ params }: RequestEvent) {
	const stageId = Number(params.id);
	const rows = db
		.prepare(
			`
    SELECT * FROM (
      SELECT
        'start' AS kind,
        se.id    AS id,
        se.ts_ms AS timestamp,
        d.name   AS driver_name,
        d.tag    AS tag
      FROM start_events se
      JOIN drivers d ON d.id = se.driver_id
      WHERE se.stage_id = ?

      UNION ALL

      SELECT
        'finish' AS kind,
        fe.id  AS id,
        fe.timestamp AS timestamp,
        NULL   AS driver_name,
        fe.tag AS tag
      FROM finish_events fe
      WHERE fe.stage_id = ?
    )
    ORDER BY timestamp ASC, kind ASC, id ASC
  `
		)
		.all(stageId, stageId);

	return json(rows);
}
