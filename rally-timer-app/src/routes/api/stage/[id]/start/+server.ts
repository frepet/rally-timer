import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const stageId = Number(event.params.id);
	const body = (await event.request.json()) as { driver_id?: unknown; driver_ids?: unknown };

	const wantsBulk = Array.isArray(body.driver_ids);
	const rawIds: unknown[] = wantsBulk
		? (body.driver_ids as unknown[])
		: body.driver_id != null
			? [body.driver_id]
			: [];
	const driverIds = Array.from(
		new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))
	);

	if (!stageId || driverIds.length === 0)
		return json({ error: 'stageId & driver_id(s) required' }, { status: 400 });

	const ts_ms = Date.now();

	const rows = await sql`
		INSERT INTO start_events ${sql(
			driverIds.map((id) => ({ stage_id: stageId, driver_id: id, ts_ms })),
			'stage_id',
			'driver_id',
			'ts_ms'
		)}
		RETURNING id, stage_id, driver_id, ts_ms
	`;

	return json(wantsBulk ? rows : rows[0], { status: 201 });
}
