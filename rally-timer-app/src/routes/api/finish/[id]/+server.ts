import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const result = await sql`DELETE FROM finish_events WHERE id = ${id}`;
	return json({ count: result.count });
}

export async function PATCH({ params, request }: RequestEvent) {
	const id = Number(params.id);
	const body = await request.json();
	const ts = Number(body?.timestamp);
	if (!Number.isFinite(ts)) return json({ error: 'timestamp (ms) required' }, { status: 400 });
	const [row] = await sql`
		UPDATE finish_events SET timestamp = ${ts} WHERE id = ${id}
		RETURNING id, stage_id, timestamp, tag
	`;
	return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}
