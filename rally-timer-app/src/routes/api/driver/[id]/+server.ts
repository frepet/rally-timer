import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const raw = (await event.request.json()) as unknown;

	if (!raw || typeof raw !== 'object') return new Response(null, { status: 400 });
	const r = raw as { name?: unknown; class_id?: unknown; tag?: unknown; active?: unknown };

	const patch: { name?: string; class_id?: number; tag?: string; active?: boolean } = {};

	if (typeof r.name === 'string' && r.name.trim()) patch.name = r.name.trim();

	if (typeof r.tag === 'string' && r.tag.trim()) patch.tag = r.tag.trim();

	if (typeof r.class_id === 'number' && Number.isFinite(r.class_id) && r.class_id > 0) {
		patch.class_id = r.class_id;
	} else if (typeof r.class_id === 'string' && r.class_id.trim()) {
		const n = Number(r.class_id);
		if (Number.isFinite(n) && n > 0) patch.class_id = n;
	}

	if (typeof r.active === 'boolean') patch.active = r.active;

	if (!('name' in patch) && !('class_id' in patch) && !('tag' in patch) && !('active' in patch)) {
		return new Response(null, { status: 204 });
	}

	const [cur] = await sql`SELECT id, name, class_id, tag, active FROM drivers WHERE id = ${id}`;
	if (!cur) return new Response(null, { status: 404 });

	const next = {
		name: patch.name ?? (cur.name as string),
		class_id: patch.class_id ?? (cur.class_id as number),
		tag: patch.tag ?? (cur.tag as string),
		active: patch.active ?? (cur.active as boolean)
	};

	const [row] = await sql`
		UPDATE drivers
		SET name = ${next.name}, class_id = ${next.class_id}, tag = ${next.tag}, active = ${next.active}
		WHERE id = ${id}
		RETURNING id, name, class_id, tag, active
	`;

	return json(row);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = Number(event.params.id);
	const result = await sql`DELETE FROM drivers WHERE id = ${id}`;
	if (result.count === 0) return new Response(null, { status: 404 });
	return new Response(null, { status: 204 });
}
