import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { trainingConfigSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import {
	buildTrainingLeaderboard,
	type TrainingDriverInput,
	type TrainingPass
} from '../../../lib/domain/training';

type ConfigRow = {
	gate_id: string | null;
	cooldown_ms: number;
	started_at: number | null;
};

type PassRow = {
	gate_event_id: number;
	timestamp: string;
	tag: string;
	driver_id: number | null;
	driver_name: string | null;
	class_id: number | null;
	class_name: string | null;
};

async function loadConfig(): Promise<ConfigRow> {
	const [row] = await sql<ConfigRow[]>`
		SELECT gate_id, cooldown_ms, started_at FROM training WHERE id = 1
	`;
	if (!row) throw error(500, 'Training row missing');
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

	let drivers: TrainingDriverInput[] = [];
	if (config.gate_id && config.started_at !== null) {
		const rows = await sql<PassRow[]>`
			SELECT ge.id            AS gate_event_id,
			       ge.timestamp     AS timestamp,
			       ge.tag           AS tag,
			       d.id             AS driver_id,
			       d.name           AS driver_name,
			       d.class_id       AS class_id,
			       c.name           AS class_name
			FROM gate_events ge
			LEFT JOIN drivers d ON d.tag = ge.tag
			LEFT JOIN classes c ON c.id = d.class_id
			WHERE ge.gate_id = ${config.gate_id}
			  AND ge.timestamp >= ${config.started_at}
			ORDER BY ge.timestamp ASC
		`;

		const byDriver = new Map<string, { input: TrainingDriverInput; passes: TrainingPass[] }>();
		for (const r of rows) {
			if (r.driver_id === null) continue;
			const key = String(r.driver_id);
			let bucket = byDriver.get(key);
			if (!bucket) {
				bucket = {
					input: {
						driver_id: r.driver_id,
						driver_name: r.driver_name ?? '—',
						class_id: r.class_id,
						class_name: r.class_name,
						tag: r.tag,
						passes: []
					},
					passes: []
				};
				byDriver.set(key, bucket);
			}
			bucket.passes.push({
				gate_event_id: r.gate_event_id,
				timestamp: Number(r.timestamp)
			});
		}
		drivers = [...byDriver.values()].map((b) => ({ ...b.input, passes: b.passes }));
	}

	const leaderboard = buildTrainingLeaderboard(drivers, config.cooldown_ms);

	return json({
		gate_id: config.gate_id,
		gate_name,
		cooldown_ms: config.cooldown_ms,
		started_at: config.started_at !== null ? Number(config.started_at) : null,
		drivers: leaderboard
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

	const parsed = trainingConfigSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { gate_id, cooldown_ms } = parsed.data;

	if (gate_id !== undefined) {
		if (gate_id !== null) {
			const [g] = await sql<{ id: string }[]>`
				SELECT id FROM gates WHERE id = ${gate_id}
			`;
			if (!g) throw error(404, 'Gate not found');
		}
		const now = Date.now();
		await sql`
			UPDATE training
			SET gate_id = ${gate_id},
			    started_at = ${gate_id === null ? null : now}
			WHERE id = 1
		`;
	}
	if (cooldown_ms !== undefined) {
		await sql`UPDATE training SET cooldown_ms = ${cooldown_ms} WHERE id = 1`;
	}

	const updated = await loadConfig();
	return json({
		updated: true,
		gate_id: updated.gate_id,
		cooldown_ms: updated.cooldown_ms,
		started_at: updated.started_at !== null ? Number(updated.started_at) : null
	});
}

// "Clear" the current session: bump started_at to now. Old gate_events stay
// in the DB but disappear from the training page.
export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const now = Date.now();
	await sql`UPDATE training SET started_at = ${now} WHERE id = 1`;
	return json({ cleared: true, started_at: now });
}
