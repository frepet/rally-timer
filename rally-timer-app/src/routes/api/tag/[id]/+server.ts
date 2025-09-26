import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { tagParamSchema } from '../../../../lib/server/schemas';

export async function GET(event: RequestEvent): Promise<Response> {
	const tagRaw = event.params.id;
	if (!tagRaw) return json({ error: 'Missing tag' }, { status: 400 });
	const parsed = tagParamSchema.safeParse(tagRaw);
	if (!parsed.success) return json({ error: 'Invalid tag' }, { status: 400 });
	const row = db
		.prepare('SELECT id, name, tag FROM drivers WHERE tag = ? COLLATE NOCASE')
		.get(parsed.data);
	return json({ driver: row ?? null });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const idRaw = event.params.id;
	if (!idRaw) throw error(400, 'Missing id');
	const res = db.prepare('DELETE FROM drivers WHERE id = ?;').run(Number(idRaw));
	if (res.changes === 0) return new Response(null, { status: 404 });
	return new Response(null, { status: 204 });
}
