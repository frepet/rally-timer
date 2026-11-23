import { assertEventSelection } from '$lib/server/eventSelection';
import { requireStageEvent } from '$lib/server/eventContext';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';
import { meanRssi, rssiDelta } from '../../../../../lib/domain/rssi';

export async function GET(event: RequestEvent) {
	const appEvent = await requireStageEvent(Number(event.params.id));
	assertEventSelection(event.url, appEvent.id);
	const stageId = Number(event.params.id);
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

	const events = rows.map((r) => ({
		...r,
		timestamp: Number(r.timestamp),
		rssi: r.rssi == null ? null : Number(r.rssi)
	}));

	// The gate moves between stages, so the baseline is this stage's own finish reads.
	const stageMean = meanRssi(events.map((e) => e.rssi));
	return json(events.map((e) => ({ ...e, rssi_delta: rssiDelta(e.rssi, stageMean) })));
}
