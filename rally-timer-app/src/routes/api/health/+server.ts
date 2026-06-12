import { json } from '@sveltejs/kit';

import { sql } from '../../../lib/server/db';

export async function GET(): Promise<Response> {
	try {
		await sql`SELECT 1`;
		return json({ status: 'ok' });
	} catch {
		return json({ status: 'unhealthy' }, { status: 503 });
	}
}
