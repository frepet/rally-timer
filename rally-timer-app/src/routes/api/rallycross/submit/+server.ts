import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { submitRallySchema } from '../../../../lib/server/schemas';
import {
	buildHeatLeaderboard,
	buildOverallLeaderboard,
	buildRallycrossSubmission,
	type HeatEntry
} from '../../../../lib/domain/rallycross';

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

	const champs = await sql`SELECT id FROM championships WHERE id = ANY(${championship_ids}::uuid[])`;
	if (champs.length !== championship_ids.length) {
		throw error(400, 'One or more championship IDs are invalid');
	}

	const [cfg] = await sql<{ gate_id: string | null; cooldown_ms: number }[]>`
		SELECT gate_id, cooldown_ms FROM rallycross WHERE id = 1
	`;

	const heats = await sql<{
		id: number;
		number: number;
		required_laps: number;
		started_at: number | null;
		closed_at: number | null;
	}[]>`
		SELECT id, number, required_laps, started_at, closed_at
		FROM rallycross_heats ORDER BY number
	`;

	const allHeatResults = (
		await Promise.all(
			heats
				.filter((h) => h.started_at !== null)
				.map(async (heat) => {
					const entries = await sql<{
						driver_id: number;
						driver_name: string;
						class_id: number;
						class_name: string;
						driver_uuid: string;
						tag: string;
						ts_ms: number;
						dnf: boolean;
						dnf_time_ms: number | null;
					}[]>`
						SELECT rhe.driver_id, d.name AS driver_name, d.class_id, c.name AS class_name,
						       d.uuid::text AS driver_uuid, d.tag, rhe.ts_ms, rhe.dnf, rhe.dnf_time_ms
						FROM rallycross_heat_entries rhe
						JOIN drivers d ON d.id  = rhe.driver_id
						JOIN classes c ON c.id  = d.class_id
						WHERE rhe.heat_id = ${heat.id}
					`;

					const heatEntries: (HeatEntry & { driver_uuid: string })[] = await Promise.all(
						entries.map(async (e) => {
							const passes = cfg.gate_id
								? await sql<{ timestamp: number }[]>`
										SELECT timestamp FROM gate_events
										WHERE gate_id = ${cfg.gate_id} AND tag = ${e.tag}
										  AND timestamp >= ${Number(e.ts_ms)}
										ORDER BY timestamp
									`
								: ([] as { timestamp: number }[]);
							return {
								driver_id: e.driver_id,
								driver_name: e.driver_name,
								class_id: e.class_id,
								class_name: e.class_name,
								driver_uuid: e.driver_uuid,
								tag: e.tag,
								ts_ms: Number(e.ts_ms),
								dnf: e.dnf,
								dnf_time_ms: e.dnf_time_ms !== null ? Number(e.dnf_time_ms) : null,
								passes: passes.map((p) => Number(p.timestamp))
							};
						})
					);

					return buildHeatLeaderboard(
						heatEntries,
						heat.number,
						heat.required_laps,
						cfg.cooldown_ms
					).map((r) => {
						const entry = heatEntries.find((e) => e.driver_id === r.driver_id);
						return { ...r, driver_uuid: entry?.driver_uuid ?? '' };
					});
				})
		)
	).flat();

	const overall = buildOverallLeaderboard(allHeatResults);
	const uuidMap = new Map<number, string>();
	for (const r of allHeatResults) {
		if (!uuidMap.has(r.driver_id)) uuidMap.set(r.driver_id, (r as { driver_uuid?: string }).driver_uuid ?? '');
	}
	const overallWithUuid = overall.map((r) => ({
		...r,
		driver_uuid: uuidMap.get(r.driver_id) ?? ''
	}));

	const stageTimes = buildRallycrossSubmission(overallWithUuid);

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
