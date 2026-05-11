import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';

type EntryRow = {
	driver_id: number;
	driver_name: string;
	class_id: number;
	class_name: string;
	tag: string;
	ts_ms: number | null;
	dnf: boolean;
	dnf_time_ms: number | null;
};

export async function GET(event: RequestEvent): Promise<Response> {
	const heatId = Number(event.params.id);
	if (!heatId) throw error(400, 'Invalid heat id');

	const [heat] = await sql<{ id: number; number: number; required_laps: number; started_at: number | null; closed_at: number | null }[]>`
		SELECT id, number, required_laps, started_at, closed_at FROM rallycross_heats WHERE id = ${heatId}
	`;
	if (!heat) throw error(404, 'Värmelopp hittades inte');

	const entries = await sql<EntryRow[]>`
		SELECT
			rhe.driver_id,
			d.name        AS driver_name,
			d.class_id,
			c.name        AS class_name,
			d.tag,
			rhe.ts_ms,
			rhe.dnf,
			rhe.dnf_time_ms
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id  = rhe.driver_id
		JOIN classes c ON c.id  = d.class_id
		WHERE rhe.heat_id = ${heatId}
		ORDER BY d.name
	`;

	return json({
		id: heat.id,
		number: heat.number,
		required_laps: heat.required_laps,
		started_at: heat.started_at !== null ? Number(heat.started_at) : null,
		closed_at: heat.closed_at !== null ? Number(heat.closed_at) : null,
		entries: entries.map((e) => ({
			driver_id: e.driver_id,
			driver_name: e.driver_name,
			class_id: e.class_id,
			class_name: e.class_name,
			tag: e.tag,
			ts_ms: e.ts_ms !== null ? Number(e.ts_ms) : null,
			dnf: e.dnf,
			dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null
		}))
	});
}
