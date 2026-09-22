import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { sql, type Sql } from '$lib/server/db';
import { throwIfNotAdmin } from '$lib/server/keycloak';
import { getEvent } from '$lib/server/eventContext';
export async function GET({ params }: RequestEvent) {
	const event = await getEvent(Number(params.id));
	const drivers =
		await sql`SELECT d.id,d.name,d.tag,d.class_id,c.name AS class_name,(p.driver_id IS NOT NULL) AS active FROM drivers d JOIN classes c ON c.id=d.class_id LEFT JOIN event_participants p ON p.driver_id=d.id AND p.event_id=${event.id} ORDER BY d.name`;
	return json({ drivers });
}
export async function PUT(request: RequestEvent) {
	await throwIfNotAdmin(request);
	const parsed = z
		.object({ driver_ids: z.array(z.number().int().positive()) })
		.safeParse(await request.request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid participants');
	await sql.begin(async (transaction) => {
		const tx = transaction as unknown as Sql;
		await tx`SELECT id FROM events WHERE id=${Number(request.params.id)} FOR UPDATE`;
		const event = await getEvent(Number(request.params.id), tx);
		if (event.is_locked) throw error(409, 'Event is locked');
		const ids = [...new Set(parsed.data.driver_ids)];
		const drivers = await tx`SELECT id FROM drivers WHERE id=ANY(${ids})`;
		if (drivers.length !== ids.length) throw error(400, 'Unknown driver');
		await tx`DELETE FROM event_participants WHERE event_id=${event.id}`;
		for (const id of ids)
			await tx`INSERT INTO event_participants(event_id,driver_id) VALUES(${event.id},${id})`;
	});
	return json({ ok: true });
}
