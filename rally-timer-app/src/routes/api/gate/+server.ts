import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../lib/server/db';
import { gateRegisterSchema } from '../../../lib/server/schemas';

function ensureWal() {
	try {
		db.pragma('journal_mode = WAL');
	} catch {
		/* ignore */
	}
}

export async function GET(): Promise<Response> {
	const gates = db
		.prepare(
			`SELECT 
				g.id,
				g.name,
				g.last_seen,
				g.stage_id,
				g.created_at,
				s.name as stage_name,
				r.name as rally_name
			FROM gates g
			LEFT JOIN stages s ON s.id = g.stage_id
			LEFT JOIN rallies r ON r.id = s.rally_id
			ORDER BY g.last_seen DESC`
		)
		.all();
	return json(gates);
}

export async function POST(event: RequestEvent): Promise<Response> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateRegisterSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { id, name } = parsed.data;
	const now = Date.now();
	ensureWal();

	db.prepare(
		`INSERT INTO gates (id, name, last_seen, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			name = COALESCE(excluded.name, name),
			last_seen = ?`
	).run(id, name ?? null, now, now, now);

	return json({ id, registered: true }, { status: 201 });
}
