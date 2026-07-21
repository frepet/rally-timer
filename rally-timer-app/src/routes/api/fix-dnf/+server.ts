import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';
import { estimateDnfTime } from '../../../lib/domain/dnfEstimation';

const fixDnfSchema = z.object({
	driver_tag: z.string().min(1).max(50),
	stage_id: z.number().int().positive()
});

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = fixDnfSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);
	const { driver_tag, stage_id } = parsed.data;

	// Fetch all non-DNF finish events with computed elapsed times
	const allFinishes = await sql`
		SELECT fe.tag AS driver_tag, fe.stage_id, (fe.timestamp - se.ts_ms) AS elapsed_ms
		FROM finish_events fe
		JOIN start_events se ON se.stage_id = fe.stage_id
		JOIN drivers d ON d.tag = fe.tag AND d.id = se.driver_id
		WHERE fe.dnf = false
	`;

	const results = allFinishes.map((r) => ({
		driver_tag: String(r.driver_tag),
		stage_id: Number(r.stage_id),
		elapsed_ms: Number(r.elapsed_ms)
	}));

	const estimated = estimateDnfTime(driver_tag, stage_id, results);
	if (estimated === null) throw error(422, 'Not enough data to estimate time');

	// Get the DNF finish event and the driver's start time for this stage
	const [dnfRow] = await sql`
		SELECT fe.id, se.ts_ms AS start_ts
		FROM finish_events fe
		JOIN drivers d ON d.tag = fe.tag
		JOIN start_events se ON se.stage_id = fe.stage_id AND se.driver_id = d.id
		WHERE fe.stage_id = ${stage_id} AND fe.tag = ${driver_tag} AND fe.dnf = true
		LIMIT 1
	`;

	if (!dnfRow) throw error(404, 'DNF finish event not found');

	const newTimestamp = Number(dnfRow.start_ts) + estimated;

	await sql`
		UPDATE finish_events
		SET timestamp = ${newTimestamp}, dnf = false, synthetic = true
		WHERE id = ${dnfRow.id}
	`;

	return json({ estimated_ms: estimated, new_timestamp: newTimestamp });
}
