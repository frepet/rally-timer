import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { trainingConfigSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { buildTrainingLeaderboard } from '../../../lib/domain/training';
import { fetchTrainingConfig, fetchTrainingDriverInputs } from '../../../lib/server/trainingData';

export async function GET(): Promise<Response> {
	const config = await fetchTrainingConfig();

	let gate_name: string | null = null;
	if (config.gate_id) {
		const [g] = await sql<{ name: string | null }[]>`
			SELECT name FROM gates WHERE id = ${config.gate_id}
		`;
		gate_name = g?.name ?? null;
	}

	const drivers = await fetchTrainingDriverInputs(config);
	const leaderboard = buildTrainingLeaderboard(drivers, config.cooldown_ms);

	return json({
		gate_id: config.gate_id,
		gate_name,
		cooldown_ms: config.cooldown_ms,
		started_at: config.started_at,
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
		// Only auto-start when a gate is first assigned (started_at was null).
		// Re-assigning to a different gate mid-session leaves started_at alone.
		// Unassigning a gate clears started_at (no active session without a gate).
		if (gate_id === null) {
			await sql`UPDATE training SET gate_id = NULL, started_at = NULL WHERE id = 1`;
		} else {
			await sql`
				UPDATE training
				SET gate_id    = ${gate_id},
				    started_at = COALESCE(started_at, ${Date.now()})
				WHERE id = 1
			`;
		}
	}
	if (cooldown_ms !== undefined) {
		await sql`UPDATE training SET cooldown_ms = ${cooldown_ms} WHERE id = 1`;
	}

	const updated = await fetchTrainingConfig();
	return json({ updated: true, ...updated });
}

// "Clear" the current session: bump started_at to now. Old gate_events stay
// in the DB but disappear from the training page.
export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const now = Date.now();
	await sql`UPDATE training SET started_at = ${now} WHERE id = 1`;
	return json({ cleared: true, started_at: now });
}
