import { json, error } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';

export async function POST(event: { params: { id?: string } }): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	const now = Date.now();
	db.prepare('UPDATE gates SET last_seen = ? WHERE id = ?').run(now, id);

	return json({ ok: true });
}
