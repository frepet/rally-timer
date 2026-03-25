import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { gateRegisterSchema, gateAssignSchema } from '../../../../lib/server/schemas';

export async function POST(event: RequestEvent): Promise<Response> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateRegisterSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { id, name } = parsed.data;
	const now = Date.now();

	await sql`
		INSERT INTO gates (id, name, last_seen, created_at)
		VALUES (${id}, ${name ?? null}, ${now}, ${now})
		ON CONFLICT (id) DO UPDATE SET
			name = COALESCE(EXCLUDED.name, gates.name),
			last_seen = ${now}
	`;

	return json({ id, registered: true }, { status: 201 });
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateAssignSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { stage_id, name } = parsed.data;

	if (stage_id !== undefined) {
		await sql`UPDATE gates SET stage_id = ${stage_id} WHERE id = ${id}`;
	}
	if (name !== undefined) {
		await sql`UPDATE gates SET name = ${name} WHERE id = ${id}`;
	}

	return json({ id, updated: true });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	await sql`DELETE FROM gates WHERE id = ${id}`;
	return json({ deleted: true });
}
