import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { sql, type Sql } from '$lib/server/db';
import { throwIfNotAdmin } from '$lib/server/keycloak';
import { getEvent } from '$lib/server/eventContext';
import { eventDeleteError, eventLockError } from '$lib/domain/events';
const patchSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	is_locked: z.boolean().optional()
});
export async function GET({ params }: RequestEvent) {
	const event = await getEvent(Number(params.id));
	const rows = await sql<
		{ driver_id: number }[]
	>`SELECT driver_id FROM event_participants WHERE event_id=${event.id}`;
	return json({ event, participants: rows.map((r) => r.driver_id) });
}
export async function PATCH(request: RequestEvent) {
	await throwIfNotAdmin(request);
	const parsed = patchSchema.safeParse(await request.request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid event update');
	const event = await sql.begin(async (transaction) => {
		const tx = transaction as unknown as Sql;
		await tx`SELECT id FROM events WHERE id=${Number(request.params.id)} FOR UPDATE`;
		const current = await getEvent(Number(request.params.id), tx);
		const locked = parsed.data.is_locked ?? current.is_locked;
		const assignments =
			await tx`SELECT id FROM gate_assignments WHERE event_id=${current.id} AND released_at IS NULL`;
		const reason = eventLockError(current, locked, assignments.length > 0);
		if (reason) throw error(400, reason);
		if (current.is_locked && parsed.data.name !== undefined && parsed.data.is_locked !== false)
			throw error(409, 'Unlock the event before editing');
		await tx`UPDATE events SET name=${parsed.data.name ?? current.name},is_locked=${locked} WHERE id=${current.id}`;
		return { ...current, name: parsed.data.name ?? current.name, is_locked: locked };
	});
	return json(event);
}
export async function DELETE(request: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(request);
	await sql.begin(async (transaction) => {
		const tx = transaction as unknown as Sql;
		await tx`SELECT id FROM events WHERE id=${Number(request.params.id)} FOR UPDATE`;
		const current = await getEvent(Number(request.params.id), tx);
		const assignments =
			await tx`SELECT id FROM gate_assignments WHERE event_id=${current.id} AND released_at IS NULL`;
		const reason = eventDeleteError(current, assignments.length > 0);
		if (reason) throw error(409, reason);
		await tx`DELETE FROM events WHERE id=${current.id}`;
	});
	return new Response(null, { status: 204 });
}
