import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { submitRallySchema } from '../../../lib/server/schemas';

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
	const now = Date.now();

	// Validate all championship IDs exist
	const champs = await sql`
		SELECT id FROM championships WHERE id = ANY(${championship_ids}::uuid[])
	`;
	if (champs.length !== championship_ids.length) {
		throw error(400, 'One or more championship IDs are invalid');
	}

	// Snapshot current timing data: one row per (driver, stage), latest start wins.
	// If the latest start has a finish, elapsed_ms is set; otherwise NULL (DNF).
	const stageTimes = await sql`
		SELECT DISTINCT ON (st.driver_id, st.stage_id)
			d.uuid::text  AS driver_uuid,
			st.driver_name,
			st.class_id,
			st.class_name,
			st.stage_name,
			st.elapsed_ms
		FROM stage_times st
		JOIN drivers d ON d.id = st.driver_id
		ORDER BY st.driver_id, st.stage_id, st.start_ms DESC, st.elapsed_ms ASC NULLS LAST
	`;

	let submittedRallyId: string;

	// TransactionSql loses call signatures via Omit<> — cast to the outer sql type
	await sql.begin(async (tx) => {
		const tsql = tx as unknown as typeof sql;

		const [sr] = await tsql`
			INSERT INTO submitted_rallies (name, submitted_at)
			VALUES (${name}, ${now})
			RETURNING id
		`;
		submittedRallyId = sr.id as string;

		if (stageTimes.length > 0) {
			const rows = stageTimes.map((r) => ({
				rally_id: submittedRallyId,
				driver_uuid: r.driver_uuid as string,
				driver_name: r.driver_name as string,
				class_id: r.class_id as number,
				class_name: r.class_name as string,
				stage_name: r.stage_name as string,
				elapsed_ms: r.elapsed_ms as number | null
			}));
			await tsql`INSERT INTO rally_results ${tsql(rows)}`;
		}

		for (const champId of championship_ids) {
			await tsql`
				INSERT INTO championship_rallies (championship_id, rally_id)
				VALUES (${champId}::uuid, ${submittedRallyId}::uuid)
			`;
		}
	});

	return json({ id: submittedRallyId! }, { status: 201 });
}
