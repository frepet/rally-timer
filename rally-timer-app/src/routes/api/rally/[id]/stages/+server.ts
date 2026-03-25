import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function GET({ params }: RequestEvent) {
	const rallyId = Number(params.id);
	const rows = await sql`SELECT id, rally_id, name FROM stages WHERE rally_id = ${rallyId} ORDER BY id`;
	return json(rows);
}

export async function POST(event: RequestEvent) {
	await throwIfNotAdmin(event);
	const rallyId = Number(event.params.id);
	const { name } = await event.request.json();

	if (!name || !name.trim()) {
		return json({ error: 'Stage name required' }, { status: 400 });
	}

	const [row] = await sql`
		INSERT INTO stages (rally_id, name) VALUES (${rallyId}, ${name.trim()})
		RETURNING id, rally_id, name
	`;

	return json(row, { status: 201 });
}
