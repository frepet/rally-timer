import { json, error } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';

export async function POST(event: { params: { id?: string } }): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	const now = Date.now();
	await sql`UPDATE gates SET last_seen = ${now} WHERE id = ${id}`;

	return json({ ok: true });
}
