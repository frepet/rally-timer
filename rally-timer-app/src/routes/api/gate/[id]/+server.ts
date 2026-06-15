import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { registerGate } from '../../../../lib/server/gateAuth';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
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

	return registerGate(event, parsed.data);
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
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

	const { stage_id, name, status } = parsed.data;

	if (stage_id !== undefined) {
		if (stage_id !== null) {
			const [rx] = await sql<{ gate_id: string | null }[]>`
				SELECT gate_id FROM rallycross WHERE id = 1
			`;
			if (rx?.gate_id === id)
				throw error(409, 'Grinden används av rallycross — koppla bort den där först');
		}
		await sql`UPDATE gates SET stage_id = ${stage_id} WHERE id = ${id}`;
	}
	if (name !== undefined) {
		await sql`UPDATE gates SET name = ${name} WHERE id = ${id}`;
	}
	if (status !== undefined) {
		await sql`UPDATE gates SET status = ${status} WHERE id = ${id}`;
	}

	return json({ id, updated: true });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	await sql`DELETE FROM gates WHERE id = ${id}`;
	return json({ deleted: true });
}
