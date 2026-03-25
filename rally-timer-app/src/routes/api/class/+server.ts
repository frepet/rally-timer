import { json } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';

export async function GET(): Promise<Response> {
	const rows = await sql`SELECT id, name FROM classes ORDER BY name`;
	return json(rows);
}
