import { json } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';

export async function GET(): Promise<Response> {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
	}
	const rows = db.prepare('SELECT id, name FROM classes ORDER BY name;').all();
	return json(rows);
}
