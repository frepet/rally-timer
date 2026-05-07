import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { rallycrossConfigSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

type RallycrossRow = {
	gate_id: string | null;
	cooldown_ms: number;
	started_at: number | null;
};

async function loadConfig(): Promise<RallycrossRow> {
	const [row] = await sql<RallycrossRow[]>`
		SELECT gate_id, cooldown_ms, started_at FROM rallycross WHERE id = 1
	`;
	if (!row) throw error(500, 'Rallycross row missing');
	return row;
}

export async function GET(): Promise<Response> {
	const config = await loadConfig();

	let gate_name: string | null = null;
	if (config.gate_id) {
		const [g] = await sql<{ name: string | null }[]>`
			SELECT name FROM gates WHERE id = ${config.gate_id}
		`;
		gate_name = g?.name ?? null;
	}

	type DriverRow = {
		id: number;
		name: string;
		tag: string;
		class_id: number;
		class_name: string;
		passes: number[] | null;
	};
	const drivers = config.gate_id
		? await sql<DriverRow[]>`
			SELECT
				d.id,
				d.name,
				d.tag,
				d.class_id,
				c.name AS class_name,
				COALESCE(
					(
						SELECT array_agg(ge.timestamp ORDER BY ge.timestamp)
						FROM gate_events ge
						WHERE ge.gate_id = ${config.gate_id} AND ge.tag = d.tag
					),
					ARRAY[]::BIGINT[]
				) AS passes
			FROM drivers d
			JOIN classes c ON c.id = d.class_id
			WHERE d.active = true
			ORDER BY c.start_priority DESC, d.name ASC
		`
		: await sql<DriverRow[]>`
			SELECT d.id, d.name, d.tag, d.class_id, c.name AS class_name,
				ARRAY[]::BIGINT[] AS passes
			FROM drivers d
			JOIN classes c ON c.id = d.class_id
			WHERE d.active = true
			ORDER BY c.start_priority DESC, d.name ASC
		`;

	return json({
		gate_id: config.gate_id,
		gate_name,
		cooldown_ms: config.cooldown_ms,
		started_at: config.started_at,
		drivers: drivers.map((d) => ({
			id: d.id,
			name: d.name,
			tag: d.tag,
			class_id: d.class_id,
			class_name: d.class_name,
			passes: (d.passes ?? []).map(Number)
		}))
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

	const { gate_id, cooldown_ms } = parsed.data;

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

	const updated = await loadConfig();
	return json({ updated: true, ...updated });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	await sql`UPDATE rallycross SET started_at = NULL WHERE id = 1`;
	return json({ cleared: true });
}
