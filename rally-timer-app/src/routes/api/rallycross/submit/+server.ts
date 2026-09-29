import { eventSubmissionError } from '$lib/domain/events';
import { requireMutableEvent } from '$lib/server/eventContext';
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { submitRallySchema } from '../../../../lib/server/schemas';
import { fetchClosedHeatResults } from '../../../../lib/server/rallycrossData';
import { buildRallycrossSubmission } from '../../../../lib/domain/rallycross';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = submitRallySchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { championship_ids } = parsed.data;
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		const eventId = Number(event.url.searchParams.get('event_id'));
		await sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
		const appEvent = await requireMutableEvent(event.url, 'rallycross', sql);
		const units = await sql`SELECT closed_at FROM rallycross_heats WHERE event_id = ${appEvent.id}`;
		const assignments =
			await sql`SELECT id FROM gate_assignments WHERE event_id = ${appEvent.id} AND released_at IS NULL`;
		const reason = eventSubmissionError(
			appEvent,
			units.map((u) => u.closed_at !== null),
			assignments.length > 0
		);
		if (reason) throw error(409, reason);

		const champs =
			await sql`SELECT id FROM championships WHERE id = ANY(${championship_ids}::uuid[])`;
		if (champs.length !== championship_ids.length) {
			throw error(400, 'One or more championship IDs are invalid');
		}

		const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE event_id = ${appEvent.id}
	`;

		const allHeatResults = await fetchClosedHeatResults(cfg, appEvent.id, sql);
		const stageTimes = buildRallycrossSubmission(allHeatResults);

		if (stageTimes.length === 0) throw error(422, 'Inga färdiga resultat att skicka in');

		const now = Date.now();

		const [sr] = await sql`
			INSERT INTO submitted_rallies (name, submitted_at, event_id, event_type)
			VALUES (${appEvent.name}, ${now}, ${appEvent.id}, 'rallycross')
			RETURNING id
		`;
		const submittedRallyId = sr.id as string;

		await sql`INSERT INTO rally_results ${sql(stageTimes.map((r) => ({ ...r, rally_id: submittedRallyId })))}`;

		for (const champId of championship_ids) {
			await sql`
				INSERT INTO championship_rallies (championship_id, rally_id)
				VALUES (${champId}::uuid, ${submittedRallyId}::uuid)
			`;
		}
		await sql`UPDATE events SET is_locked = true WHERE id = ${appEvent.id}`;
		return json({ id: submittedRallyId! }, { status: 201 });
	});
}
