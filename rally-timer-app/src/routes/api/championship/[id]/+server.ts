import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { championshipUpdateSchema } from '../../../../lib/server/schemas';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = event.params.id!;
	const [champ] = await sql`SELECT id, name, created_at FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	const rallies = await sql`
		SELECT sr.id, sr.name, sr.submitted_at
		FROM championship_rallies cr
		JOIN submitted_rallies sr ON sr.id = cr.rally_id
		WHERE cr.championship_id = ${id}::uuid
		ORDER BY sr.submitted_at
	`;

	return json({ ...champ, rallies });
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = championshipUpdateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const result = await sql`
		UPDATE championships SET name = ${parsed.data.name} WHERE id = ${id}::uuid
	`;
	if (result.count === 0) throw error(404, 'Championship not found');

	return json({ id, name: parsed.data.name });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;
	const result = await sql`DELETE FROM championships WHERE id = ${id}::uuid`;
	if (result.count === 0) throw error(404, 'Championship not found');
	return new Response(null, { status: 204 });
}
