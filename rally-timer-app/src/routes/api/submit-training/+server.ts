import { trainingSubmissionError } from '$lib/domain/events';
import { buildTrainingLeaderboard } from '$lib/domain/training';
import { requireMutableEvent } from '$lib/server/eventContext';
import { sql as db } from '$lib/server/db';
import { throwIfNotAdmin } from '$lib/server/keycloak';
import { submitRallySchema } from '$lib/server/schemas';
import { fetchTrainingConfig, fetchTrainingDriverInputs } from '$lib/server/trainingData';
import { error, json, type RequestEvent } from '@sveltejs/kit';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	const body = await event.request.json().catch(() => null);
	const parsed = submitRallySchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	return db.begin(async (transaction) => {
		const sql = transaction as unknown as typeof db;
		const eventId = Number(event.url.searchParams.get('event_id'));
		await sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
		const appEvent = await requireMutableEvent(event.url, 'training', sql);
		const assignments =
			await sql`SELECT id FROM gate_assignments WHERE event_id = ${appEvent.id} AND released_at IS NULL`;
		const config = await fetchTrainingConfig(appEvent.id, sql);
		const inputs = await fetchTrainingDriverInputs(config, appEvent.id, sql);
		const results = buildTrainingLeaderboard(inputs, config.cooldown_ms);
		const lapCount = results.reduce((total, driver) => total + driver.lap_count, 0);
		const reason = trainingSubmissionError(appEvent, assignments.length > 0, lapCount);
		if (reason) throw error(409, reason);

		const { championship_ids } = parsed.data;
		const championships = await sql`
			SELECT id FROM championships WHERE id = ANY(${championship_ids}::uuid[])
		`;
		if (championships.length !== championship_ids.length) {
			throw error(400, 'One or more championship IDs are invalid');
		}

		const now = Date.now();
		const [submitted] = await sql`
			INSERT INTO submitted_rallies (name, submitted_at, event_id, event_type)
			VALUES (${appEvent.name}, ${now}, ${appEvent.id}, 'training')
			RETURNING id
		`;
		const submittedId = submitted.id as string;

		for (const driver of results) {
			await sql`
				INSERT INTO submitted_training_results (
					rally_id, driver_id, driver_name, class_id, class_name, tag,
					lap_count, best_lap_ms, median_lap_ms, last_lap_ms, last_pass_ms, laps
				) VALUES (
					${submittedId}::uuid, ${driver.driver_id}, ${driver.driver_name},
					${driver.class_id}, ${driver.class_name}, ${driver.tag}, ${driver.lap_count},
					${driver.best_lap_ms}, ${driver.median_lap_ms}, ${driver.last_lap_ms},
					${driver.last_pass_ms}, ${sql.json(driver.laps)}
				)
			`;
		}

		for (const championshipId of championship_ids) {
			await sql`
				INSERT INTO championship_rallies (championship_id, rally_id)
				VALUES (${championshipId}::uuid, ${submittedId}::uuid)
			`;
		}

		await sql`UPDATE events SET is_locked = true WHERE id = ${appEvent.id}`;
		return json({ id: submittedId }, { status: 201 });
	});
}
