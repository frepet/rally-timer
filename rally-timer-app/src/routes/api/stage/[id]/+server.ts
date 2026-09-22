import { assertEventSelection } from '$lib/server/eventSelection';
import { releaseGate } from '$lib/server/eventGates';
import { requireStageEvent } from '$lib/server/eventContext';
import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql as db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function PATCH(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireStageEvent(Number(event.params.id), true, sql);
		assertEventSelection(event.url, appEvent.id);
		const id = Number(event.params.id);
		if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');

		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			throw error(400, 'Invalid JSON');
		}
		const name = (body as { name?: unknown })?.name;

		if (typeof name !== 'string' || !name.trim()) {
			return json({ error: 'Stage name required' }, { status: 400 });
		}

		const [row] = await sql`
		UPDATE stages SET name = ${name.trim()} WHERE id = ${id} RETURNING id, name
	`;

		return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
	});
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireStageEvent(Number(event.params.id), true, sql);
		assertEventSelection(event.url, appEvent.id);
		const id = Number(event.params.id);
		if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
		const gates = await sql`SELECT id FROM gates WHERE stage_id = ${id}`;
		for (const gate of gates) await releaseGate(sql, String(gate.id), appEvent.id);
		const result = await sql`DELETE FROM stages WHERE id = ${id}`;
		return new Response(null, { status: result.count > 0 ? 204 : 404 });
	});
}
