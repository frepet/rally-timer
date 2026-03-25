import { json, error, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';
import { gateRegisterSchema, gateAssignSchema } from '../../../../lib/server/schemas';

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

export async function PATCH(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateAssignSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	const { stage_id } = parsed.data;
	ensureWal();

	if (stage_id === null) {
		db.prepare('UPDATE gates SET stage_id = NULL WHERE id = ?').run(id);
	} else {
		db.prepare('UPDATE gates SET stage_id = ? WHERE id = ?').run(stage_id, id);
	}

	return json({ id, stage_id, updated: true });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	db.prepare('DELETE FROM gates WHERE id = ?').run(id);
	return json({ deleted: true });
}
