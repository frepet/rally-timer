import { assignGate, releaseEventGates } from '$lib/server/eventGates';
import { requireEvent, requireMutableEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../lib/server/db';
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

async function loadConfig(eventId: number, tx: typeof sql = sql): Promise<ConfigRow> {
	const [row] = await tx<ConfigRow[]>`
		SELECT gate_id, cooldown_ms, started_at, max_per_heat, required_laps
		FROM rallycross WHERE event_id = ${eventId}
	`;
	if (!row) throw error(500, 'Rallycross row missing');
	return row;
}

async function loadHeats(eventId: number): Promise<HeatRow[]> {
	return sql<HeatRow[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats WHERE event_id = ${eventId} ORDER BY number
	`;
}

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'rallycross');
	const config = await loadConfig(appEvent.id);
	const heats = await loadHeats(appEvent.id);

	let gate_name: string | null = null;
	if (config.gate_id) {
		const [g] = await sql<{ name: string | null }[]>`
			SELECT name FROM gates WHERE id = ${config.gate_id}
		`;
		gate_name = g?.name ?? null;
	}

	const heatDrivers = heats.length
		? await sql<{ heat_id: number; driver_id: number; driver_name: string }[]>`
				SELECT rhe.heat_id, rhe.driver_id, d.name AS driver_name
				FROM rallycross_heat_entries rhe
				JOIN drivers d ON d.id = rhe.driver_id
				WHERE rhe.heat_id = ANY(${heats.map((h) => h.id)}) ORDER BY rhe.heat_id, d.name
			`
		: [];

	const driversByHeat = new Map<number, string[]>();
	const driverEntriesByHeat = new Map<number, { id: number; name: string }[]>();
	for (const row of heatDrivers) {
		const names = driversByHeat.get(row.heat_id) ?? [];
		names.push(row.driver_name);
		driversByHeat.set(row.heat_id, names);

		const entries = driverEntriesByHeat.get(row.heat_id) ?? [];
		entries.push({ id: row.driver_id, name: row.driver_name });
		driverEntriesByHeat.set(row.heat_id, entries);
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
			closed_at: h.closed_at !== null ? Number(h.closed_at) : null,
			drivers: driversByHeat.get(h.id) ?? [],
			driver_entries: driverEntriesByHeat.get(h.id) ?? []
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
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'rallycross', sql);

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
			{
				const tsql = sql;
				await requireMutableEvent(event.url, 'rallycross', tsql);
				const active =
					await tsql`SELECT id FROM rallycross_heats WHERE event_id = ${appEvent.id} AND started_at IS NOT NULL AND closed_at IS NULL`;
				if (active.length) throw error(409, 'Close the active heat before changing gates');
				await releaseEventGates(tsql, appEvent.id);
				if (gate_id !== null) await assignGate(tsql, gate_id, appEvent.id);
				await tsql`UPDATE rallycross SET gate_id = ${gate_id} WHERE event_id = ${appEvent.id}`;
			}
		}
		if (cooldown_ms !== undefined) {
			await sql`UPDATE rallycross SET cooldown_ms = ${cooldown_ms} WHERE event_id = ${appEvent.id}`;
		}
		if (max_per_heat !== undefined) {
			await sql`UPDATE rallycross SET max_per_heat = ${max_per_heat} WHERE event_id = ${appEvent.id}`;
		}
		if (required_laps !== undefined) {
			await sql`UPDATE rallycross SET required_laps = ${required_laps} WHERE event_id = ${appEvent.id}`;
		}

		const updated = await loadConfig(appEvent.id, sql);
		return json({ updated: true, ...updated });
	});
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'rallycross', sql);
		{
			const tsql = sql;
			await releaseEventGates(tsql, appEvent.id);
		}
		await sql`DELETE FROM rallycross_heats WHERE event_id = ${appEvent.id}`;
		await sql`
		UPDATE rallycross
		SET started_at = NULL, gate_id = NULL,
		    max_per_heat = 4, required_laps = 3, cooldown_ms = 10000
		WHERE event_id = ${appEvent.id}
	`;
		return json({ cleared: true });
	});
}

const sql = db;
