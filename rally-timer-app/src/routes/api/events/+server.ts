import { json, error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { sql, type Sql } from '$lib/server/db';
import { throwIfNotAdmin } from '$lib/server/keycloak';
import type { AppEvent } from '$lib/domain/events';
const createSchema = z.object({
	name: z.string().trim().min(1).max(200),
	type: z.enum(['rally', 'rallycross', 'training'])
});
export async function GET() {
	const events = await sql<
		AppEvent[]
	>`SELECT id,type,name,created_at,is_locked FROM events ORDER BY created_at DESC,id DESC`;
	return json({ events: events.map((e) => ({ ...e, created_at: Number(e.created_at) })) });
}
export async function POST(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const parsed = createSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Provide an event name and valid type');
	const created = await sql.begin(async (transaction) => {
		const tx = transaction as unknown as Sql;
		const [row] = await tx<
			AppEvent[]
		>`INSERT INTO events(name,type,created_at) VALUES(${parsed.data.name},${parsed.data.type},${Date.now()}) RETURNING id,type,name,created_at,is_locked`;
		if (row.type === 'training') await tx`INSERT INTO training(event_id) VALUES(${row.id})`;
		if (row.type === 'rallycross') await tx`INSERT INTO rallycross(event_id) VALUES(${row.id})`;
		return row;
	});
	return json({ ...created, created_at: Number(created.created_at) }, { status: 201 });
}
