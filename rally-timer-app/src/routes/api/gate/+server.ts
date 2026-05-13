import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../lib/server/db';
import { gateRegisterSchema } from '../../../lib/server/schemas';

export async function GET(): Promise<Response> {
	const gates = await sql`
		SELECT
			g.id,
			g.name,
			g.last_seen,
			g.stage_id,
			g.created_at,
			s.name AS stage_name,
			EXISTS(SELECT 1 FROM rallycross WHERE gate_id = g.id) AS is_rallycross
		FROM gates g
		LEFT JOIN stages s ON s.id = g.stage_id
		ORDER BY g.last_seen DESC
	`;
	return json(
		gates.map((g) => ({ ...g, last_seen: Number(g.last_seen), created_at: Number(g.created_at) }))
	);
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

	await sql`
		INSERT INTO gates (id, name, last_seen, created_at)
		VALUES (${id}, ${name ?? null}, ${now}, ${now})
		ON CONFLICT (id) DO UPDATE SET
			name = COALESCE(EXCLUDED.name, gates.name),
			last_seen = ${now}
	`;

	return json({ id, registered: true }, { status: 201 });
}
