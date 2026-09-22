import { requireEvent, requireMutableEvent } from '$lib/server/eventContext';
import { assignGate, releaseEventGates } from '$lib/server/eventGates';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../lib/server/db';
import { trainingConfigSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { buildTrainingLeaderboard } from '../../../lib/domain/training';
import { fetchTrainingConfig, fetchTrainingDriverInputs } from '../../../lib/server/trainingData';

export async function GET(event: RequestEvent): Promise<Response> {
	const appEvent = await requireEvent(event.url, 'training');
	const config = await fetchTrainingConfig(appEvent.id);

	let gate_name: string | null = null;
	if (config.gate_id) {
		const [g] = await sql<{ name: string | null }[]>`
			SELECT name FROM gates WHERE id = ${config.gate_id}
		`;
		gate_name = g?.name ?? null;
	}

	const drivers = await fetchTrainingDriverInputs(config, appEvent.id);
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
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'training', sql);

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
			{
				const tsql = sql;
				await releaseEventGates(tsql, appEvent.id);
				if (gate_id !== null) await assignGate(tsql, gate_id, appEvent.id);
				await tsql`UPDATE training SET gate_id = ${gate_id}, started_at = COALESCE(started_at, ${Date.now()}) WHERE event_id = ${appEvent.id}`;
			}
		}
		if (cooldown_ms !== undefined) {
			await sql`UPDATE training SET cooldown_ms = ${cooldown_ms} WHERE event_id = ${appEvent.id}`;
		}

		const updated = await fetchTrainingConfig(appEvent.id, sql);
		return json({ updated: true, ...updated });
	});
}

// "Clear" the current session: bump started_at to now. Old gate_events stay
// in the DB but disappear from the training page.
export async function DELETE(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'training', sql);
		const now = Date.now();
		await sql`UPDATE training SET started_at = ${now} WHERE event_id = ${appEvent.id}`;
		return json({ cleared: true, started_at: now });
	});
}

const sql = db;
