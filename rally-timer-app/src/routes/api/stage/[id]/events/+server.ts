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
				d.tag    AS tag,
				NULL::INTEGER AS rssi
			FROM start_events se
			JOIN drivers d ON d.id = se.driver_id
			WHERE se.stage_id = ${stageId}

			UNION ALL

			SELECT
				'finish'       AS kind,
				fe.id          AS id,
				fe.timestamp   AS timestamp,
				NULL           AS driver_name,
				fe.tag         AS tag,
				(
					SELECT ge.rssi
					FROM gate_events ge
					JOIN gates g ON g.id = ge.gate_id
					WHERE ge.tag = fe.tag
					  AND ge.timestamp = fe.timestamp
					ORDER BY ge.id ASC
					LIMIT 1
				) AS rssi
			FROM finish_events fe
			WHERE fe.stage_id = ${stageId}
		) combined
		ORDER BY timestamp ASC, kind ASC, id ASC
	`;

	return json(
		rows.map((r) => ({
			...r,
			timestamp: Number(r.timestamp),
			rssi: r.rssi == null ? null : Number(r.rssi)
		}))
	);
}
