import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { submitRallySchema } from '../../../lib/server/schemas';
import { buildStageTimes } from '../../../lib/domain/rallySubmission';
import { buildStageData } from '../../../lib/domain/submittedRally';
import { computeRallyRatings } from '../../../lib/domain/ratings';

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

	const rawStarts = await sql`
		SELECT
			se.driver_id,
			se.stage_id,
			se.ts_ms,
			d.uuid::text  AS driver_uuid,
			d.name        AS driver_name,
			d.tag         AS driver_tag,
			d.class_id,
			c.name        AS class_name,
			s.name        AS stage_name
		FROM start_events se
		JOIN drivers d ON d.id  = se.driver_id
		JOIN classes c ON c.id  = d.class_id
		JOIN stages  s ON s.id  = se.stage_id
	`;

	const rawFinishes = await sql`
		SELECT stage_id, timestamp, tag, dnf, penalty_ms FROM finish_events
	`;

	// DNF drivers get elapsed_ms = null unless close-stage was run first, which inserts
	// synthetic finish events so they appear with penalty times and dnf = true.
	// Filter out any null-elapsed entries — only committed finishes go into results.
	const allStageTimes = buildStageTimes(
		rawStarts.map((se) => ({
			driver_id: se.driver_id as number,
			stage_id: se.stage_id as number,
			ts_ms: Number(se.ts_ms),
			driver_uuid: se.driver_uuid as string,
			driver_name: se.driver_name as string,
			driver_tag: se.driver_tag as string,
			class_id: se.class_id as number,
			class_name: se.class_name as string,
			stage_name: se.stage_name as string
		})),
		rawFinishes.map((fe) => ({
			stage_id: fe.stage_id as number,
			tag: fe.tag as string,
			timestamp: Number(fe.timestamp),
			penalty_ms: Number(fe.penalty_ms ?? 0),
			dnf: Boolean(fe.dnf)
		}))
	);
	const stageTimes = allStageTimes.filter(
		(r): r is typeof r & { elapsed_ms: number } => r.elapsed_ms !== null
	);

	// Load current ratings for all drivers appearing in this rally
	const driverUuids = [...new Set(stageTimes.map((r) => r.driver_uuid))];
	const driverRows =
		driverUuids.length > 0
			? await sql`SELECT uuid::text AS uuid, rating FROM drivers WHERE uuid = ANY(${driverUuids}::uuid[])`
			: [];
	const initialRatings = new Map(driverRows.map((r) => [r.uuid as string, r.rating as number]));

	// Compute Elo changes for this rally
	const stagesForRating = buildStageData(
		stageTimes.map((r) => ({
			driver_uuid: r.driver_uuid,
			driver_name: r.driver_name,
			class_name: r.class_name,
			stage_name: r.stage_name,
			stage_order: r.stage_order,
			elapsed_ms: r.elapsed_ms,
			dnf: r.dnf
		}))
	);
	const { finalRatings } = computeRallyRatings(stagesForRating, initialRatings);

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
			// Strip driver_id — rally_results stores a snapshot keyed by driver_uuid.
			await tsql`INSERT INTO rally_results ${tsql(
				stageTimes.map(({ driver_id: _driverId, ...r }) => ({ ...r, rally_id: submittedRallyId }))
			)}`;
		}

		for (const champId of championship_ids) {
			await tsql`
				INSERT INTO championship_rallies (championship_id, rally_id)
				VALUES (${champId}::uuid, ${submittedRallyId}::uuid)
			`;
		}

		// Persist rating changes
		for (const [driverUuid, ratingAfter] of finalRatings) {
			const ratingBefore = initialRatings.get(driverUuid) ?? 1500;
			await tsql`UPDATE drivers SET rating = ${ratingAfter} WHERE uuid = ${driverUuid}::uuid`;
			await tsql`
				INSERT INTO rally_driver_ratings (rally_id, driver_uuid, rating_before, rating_after)
				VALUES (${submittedRallyId}::uuid, ${driverUuid}::uuid, ${ratingBefore}, ${ratingAfter})
			`;
		}
	});

	return json({ id: submittedRallyId! }, { status: 201 });
}
