import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { settingsSchema } from '../../../lib/server/schemas';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

export async function GET(): Promise<Response> {
	const [row] = await sql<{ pinned_view: string | null }[]>`
		SELECT pinned_view FROM settings WHERE id = 1
	`;
	return json({ pinned_view: row?.pinned_view ?? null });
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = settingsSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	await sql`
		UPDATE settings SET pinned_view = ${parsed.data.pinned_view} WHERE id = 1
	`;

	return json({ pinned_view: parsed.data.pinned_view });
}
