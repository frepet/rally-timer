import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from '$lib/server/db';
import { throwIfNotAdmin } from '$lib/server/keycloak';
import { getEvent } from '$lib/server/eventContext';
export async function GET(): Promise<Response> {
	const [row] = await sql<
		{ pinned_event_id: number | null }[]
	>`SELECT pinned_event_id FROM settings WHERE id=1`;
	return json({ pinned_event_id: row?.pinned_event_id ?? null });
}
export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const parsed = z
		.object({ pinned_event_id: z.number().int().positive().nullable() })
		.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid homepage event');
	if (parsed.data.pinned_event_id !== null) await getEvent(parsed.data.pinned_event_id);
	await sql`UPDATE settings SET pinned_event_id=${parsed.data.pinned_event_id} WHERE id=1`;
	return json(parsed.data);
}
