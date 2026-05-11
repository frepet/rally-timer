import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { heatCreateSchema } from '../../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = heatCreateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { driver_ids } = parsed.data;

	// No two open heats at once
	const [active] = await sql`
		SELECT id FROM rallycross_heats
		WHERE started_at IS NOT NULL AND closed_at IS NULL
	`;
	if (active) throw error(409, 'Det finns redan ett pågående värmelopp — stäng det först');

	const [cfg] = await sql<{ required_laps: number }[]>`
		SELECT required_laps FROM rallycross WHERE id = 1
	`;

	const [lastHeat] = await sql<{ number: number }[]>`
		SELECT number FROM rallycross_heats ORDER BY number DESC LIMIT 1
	`;
	const nextNumber = (lastHeat?.number ?? 0) + 1;

	const [heat] = await sql<{ id: number; number: number; required_laps: number }[]>`
		INSERT INTO rallycross_heats (number, required_laps)
		VALUES (${nextNumber}, ${cfg.required_laps})
		RETURNING id, number, required_laps
	`;

	if (driver_ids.length > 0) {
		await sql`
			INSERT INTO rallycross_heat_entries ${sql(
				driver_ids.map((driver_id) => ({ heat_id: heat.id, driver_id })),
				'heat_id',
				'driver_id'
			)}
		`;
	}

	const entries = await sql<{ driver_id: number; driver_name: string }[]>`
		SELECT rhe.driver_id, d.name AS driver_name
		FROM rallycross_heat_entries rhe
		JOIN drivers d ON d.id = rhe.driver_id
		WHERE rhe.heat_id = ${heat.id}
	`;

	return json(
		{
			id: heat.id,
			number: heat.number,
			required_laps: heat.required_laps,
			started_at: null,
			closed_at: null,
			entries: entries.map((e) => ({ driver_id: e.driver_id, driver_name: e.driver_name }))
		},
		{ status: 201 }
	);
}
