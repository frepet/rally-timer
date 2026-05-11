import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { rallycrossConfigSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

type ConfigRow = {
	gate_id: string | null;
	cooldown_ms: number;
	started_at: number | null;
	max_per_heat: number;
	required_laps: number;
};

type HeatRow = {
	id: number;
	number: number;
	required_laps: number;
	started_at: number | null;
	closed_at: number | null;
};

async function loadConfig(): Promise<ConfigRow> {
	const [row] = await sql<ConfigRow[]>`
		SELECT gate_id, cooldown_ms, started_at, max_per_heat, required_laps
		FROM rallycross WHERE id = 1
	`;
	if (!row) throw error(500, 'Rallycross row missing');
	return row;
}

async function loadHeats(): Promise<HeatRow[]> {
	return sql<HeatRow[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats ORDER BY number
	`;
}

export async function GET(): Promise<Response> {
	const config = await loadConfig();
	const heats = await loadHeats();

	let gate_name: string | null = null;
	if (config.gate_id) {
		const [g] = await sql<{ name: string | null }[]>`
			SELECT name FROM gates WHERE id = ${config.gate_id}
		`;
		gate_name = g?.name ?? null;
	}

	const activeHeat = heats.find((h) => h.started_at !== null && h.closed_at === null) ?? null;

	return json({
		gate_id: config.gate_id,
		gate_name,
		cooldown_ms: config.cooldown_ms,
		started_at: config.started_at,
		max_per_heat: config.max_per_heat,
		required_laps: config.required_laps,
		heats: heats.map((h) => ({
			id: h.id,
			number: h.number,
			required_laps: h.required_laps,
			started_at: h.started_at !== null ? Number(h.started_at) : null,
			closed_at: h.closed_at !== null ? Number(h.closed_at) : null
		})),
		active_heat: activeHeat
			? {
					id: activeHeat.id,
					number: activeHeat.number,
					required_laps: activeHeat.required_laps,
					started_at: Number(activeHeat.started_at),
					closed_at: null
				}
			: null
	});
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = rallycrossConfigSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { gate_id, cooldown_ms, max_per_heat, required_laps } = parsed.data;

	if (gate_id !== undefined) {
		if (gate_id !== null) {
			const [g] = await sql<{ id: string; stage_id: number | null }[]>`
				SELECT id, stage_id FROM gates WHERE id = ${gate_id}
			`;
			if (!g) throw error(404, 'Grind hittades inte');
			if (g.stage_id !== null)
				throw error(409, 'Grinden är redan tilldelad en sträcka — koppla bort den först');
		}
		await sql`UPDATE rallycross SET gate_id = ${gate_id} WHERE id = 1`;
	}
	if (cooldown_ms !== undefined) {
		await sql`UPDATE rallycross SET cooldown_ms = ${cooldown_ms} WHERE id = 1`;
	}
	if (max_per_heat !== undefined) {
		await sql`UPDATE rallycross SET max_per_heat = ${max_per_heat} WHERE id = 1`;
	}
	if (required_laps !== undefined) {
		await sql`UPDATE rallycross SET required_laps = ${required_laps} WHERE id = 1`;
	}

	const updated = await loadConfig();
	return json({ updated: true, ...updated });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	await sql`DELETE FROM rallycross_heats`;
	await sql`
		UPDATE rallycross
		SET started_at = NULL, gate_id = NULL,
		    max_per_heat = 4, required_laps = 3, cooldown_ms = 10000
		WHERE id = 1
	`;
	return json({ cleared: true });
}
