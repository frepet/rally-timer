import { json } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';

export async function GET(): Promise<Response> {
	const rows =
		await sql`SELECT id, name, submitted_at FROM submitted_rallies ORDER BY submitted_at DESC`;
	return json(rows);
}
