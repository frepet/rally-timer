import { json, error, type RequestEvent } from '@sveltejs/kit';

import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { finishUpdateSchema } from '../../../../lib/server/schemas';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
	const result = await sql`DELETE FROM finish_events WHERE id = ${id}`;
	return json({ count: result.count });
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = finishUpdateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { timestamp, penalty_ms } = parsed.data;

	if (penalty_ms !== undefined) {
		const [row] = await sql`
			UPDATE finish_events SET penalty_ms = ${penalty_ms} WHERE id = ${id}
			RETURNING id, stage_id, timestamp, tag, penalty_ms
		`;
		return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
	}

	const [row] = await sql`
		UPDATE finish_events SET timestamp = ${timestamp!} WHERE id = ${id}
		RETURNING id, stage_id, timestamp, tag, penalty_ms
	`;
	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}
