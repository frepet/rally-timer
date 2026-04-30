import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { pageUpdateSchema } from '../../../../lib/server/schemas';

export async function GET({ params }: RequestEvent): Promise<Response> {
	const [row] = await sql`SELECT content FROM pages WHERE slug = ${params.slug}`;
	if (!row) throw error(404, 'Page not found');
	return json(row);
}

export async function PUT(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = pageUpdateSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const [row] = await sql`
		UPDATE pages SET content = ${parsed.data.content}, updated_at = ${Date.now()}
		WHERE slug = ${event.params.slug}
		RETURNING slug, content
	`;
	if (!row) throw error(404, 'Page not found');
	return json(row);
}
