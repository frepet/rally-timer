import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
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

	const { name, championship_ids } = parsed.data;

	const champs =
		await sql`SELECT id FROM championships WHERE id = ANY(${championship_ids}::uuid[])`;
	if (champs.length !== championship_ids.length) {
		throw error(400, 'One or more championship IDs are invalid');
	}

	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;

	const allHeatResults = await fetchClosedHeatResults(cfg);
	const stageTimes = buildRallycrossSubmission(allHeatResults);

	if (stageTimes.length === 0) throw error(422, 'Inga färdiga resultat att skicka in');

	let submittedRallyId: string;
	const now = Date.now();

	await sql.begin(async (tx) => {
		const tsql = tx as unknown as typeof sql;

		const [sr] = await tsql`
			INSERT INTO submitted_rallies (name, submitted_at)
			VALUES (${name}, ${now})
			RETURNING id
		`;
		submittedRallyId = sr.id as string;

		await tsql`INSERT INTO rally_results ${tsql(stageTimes.map((r) => ({ ...r, rally_id: submittedRallyId })))}`;

		for (const champId of championship_ids) {
			await tsql`
				INSERT INTO championship_rallies (championship_id, rally_id)
				VALUES (${champId}::uuid, ${submittedRallyId}::uuid)
			`;
		}
	});

	return json({ id: submittedRallyId! }, { status: 201 });
}
