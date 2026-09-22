import { json, error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../lib/server/db';
import { assignGate, releaseGate } from '$lib/server/eventGates';
import { requireStageEvent } from '$lib/server/eventContext';
import { registerGate } from '../../../../lib/server/gateAuth';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';
import { gateRegisterSchema, gateAssignSchema } from '../../../../lib/server/schemas';

export async function POST(event: RequestEvent): Promise<Response> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = gateRegisterSchema.safeParse(body);
	if (!parsed.success) return json({ errors: parsed.error.flatten() }, { status: 400 });

	return registerGate(event, parsed.data);
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
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

	const { stage_id, name, status } = parsed.data;

	if (stage_id !== undefined)
		await sql.begin(async (transaction) => {
			const tx = transaction as unknown as typeof sql;
			if (stage_id !== null) {
				const owner = await requireStageEvent(stage_id, true, tx);
				await assignGate(tx, id, owner.id, stage_id);
			} else {
				const [current] = await tx<
					{ event_id: number }[]
				>`SELECT event_id FROM gate_assignments WHERE gate_id=${id} AND released_at IS NULL`;
				if (current) await releaseGate(tx, id, current.event_id);
			}
		});
	if (name !== undefined) {
		await sql`UPDATE gates SET name = ${name} WHERE id = ${id}`;
	}
	if (status !== undefined) {
		await sql`UPDATE gates SET status = ${status} WHERE id = ${id}`;
	}

	return json({ id, updated: true });
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const { id } = event.params;
	if (!id) throw error(400, 'Missing gate id');

	await sql.begin(async (transaction) => {
		const tx = transaction as unknown as typeof sql;
		// Gate mutex prevents a new assignment appearing between validation and deletion.
		await tx`SELECT id FROM gates WHERE id=${id} FOR UPDATE`;
		const active =
			await tx`SELECT id FROM gate_assignments WHERE gate_id=${id} AND released_at IS NULL`;
		if (active.length) throw error(409, 'Disconnect this gate before deleting it');
		const history =
			await tx`SELECT ge.id FROM gate_events ge JOIN gate_event_events gee ON gee.gate_event_id=ge.id WHERE ge.gate_id=${id} LIMIT 1`;
		if (history.length)
			throw error(409, 'This gate has saved event results; reject the gate instead of deleting it');
		await tx`DELETE FROM gates WHERE id=${id}`;
	});
	return json({ deleted: true });
}
