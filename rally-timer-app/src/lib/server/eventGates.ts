import { error } from '@sveltejs/kit';
import type { Sql } from './db';
import { getEvent } from './eventContext';
import { assignmentAt, gateAssignmentError, type GateAssignment } from '../domain/gateOwnership';

export async function assignGate(
	tx: Sql,
	gateId: string,
	eventId: number,
	stageId: number | null = null
): Promise<void> {
	const event = await getEvent(eventId, tx);
	const [gate] = await tx`SELECT id FROM gates WHERE id=${gateId} FOR NO KEY UPDATE`;
	if (!gate) throw error(404, 'Gate not found');
	if (event.is_locked) throw error(409, 'Event is locked');
	const [current] = await tx<
		GateAssignment[]
	>`SELECT event_id,stage_id,assigned_at,released_at FROM gate_assignments WHERE gate_id=${gateId} AND released_at IS NULL`;
	const reason = gateAssignmentError(current ?? null, eventId, stageId);
	if (reason) throw error(409, reason);
	if (current) return;
	if (stageId !== null) {
		const [stage] =
			await tx`SELECT id FROM stages WHERE id=${stageId} AND event_id=${eventId} AND NOT is_closed`;
		if (!stage) throw error(409, 'Stage is closed or belongs to another event');
	}
	await tx`INSERT INTO gate_assignments(gate_id,event_id,stage_id,assigned_at) VALUES(${gateId},${eventId},${stageId},${Date.now()})`;
	await tx`UPDATE gates SET stage_id=${stageId} WHERE id=${gateId}`;
}
export async function releaseGate(tx: Sql, gateId: string, eventId: number): Promise<void> {
	const event = await getEvent(eventId, tx);
	if (event.is_locked) throw error(409, 'Event is locked');
	await tx`SELECT id FROM gates WHERE id=${gateId} FOR NO KEY UPDATE`;
	const [current] = await tx<
		{ event_id: number }[]
	>`SELECT event_id FROM gate_assignments WHERE gate_id=${gateId} AND released_at IS NULL`;
	if (current && current.event_id !== eventId) throw error(409, 'Gate belongs to another event');
	await tx`UPDATE gate_assignments SET released_at=${Date.now()} WHERE gate_id=${gateId} AND event_id=${eventId} AND released_at IS NULL`;
	await tx`UPDATE gates SET stage_id=NULL WHERE id=${gateId}`;
	await tx`UPDATE rallycross SET gate_id=NULL WHERE gate_id=${gateId} AND event_id=${eventId}`;
	await tx`UPDATE training SET gate_id=NULL WHERE gate_id=${gateId} AND event_id=${eventId}`;
}
export async function releaseEventGates(tx: Sql, eventId: number): Promise<void> {
	const rows = await tx<
		{ gate_id: string }[]
	>`SELECT gate_id FROM gate_assignments WHERE event_id=${eventId} AND released_at IS NULL ORDER BY gate_id`;
	for (const row of rows) await releaseGate(tx, row.gate_id, eventId);
}
export async function captureGatePass(
	tx: Sql,
	gateId: string,
	passId: number,
	timestamp: number,
	tag: string
): Promise<boolean> {
	const history = await tx<
		GateAssignment[]
	>`SELECT event_id,stage_id,assigned_at,released_at FROM gate_assignments WHERE gate_id=${gateId} AND assigned_at<=${timestamp} AND (released_at IS NULL OR released_at>${timestamp}) ORDER BY assigned_at DESC`;
	const assignment = assignmentAt(history, timestamp);
	if (!assignment) return false;
	const event = await getEvent(assignment.event_id, tx);
	await tx`SELECT id FROM gates WHERE id=${gateId} FOR NO KEY UPDATE`;
	const [stillOwned] =
		await tx`SELECT id FROM gate_assignments WHERE gate_id=${gateId} AND event_id=${event.id} AND assigned_at<=${timestamp} AND (released_at IS NULL OR released_at>${timestamp})`;
	if (!stillOwned) return false;
	// Raw gate data is retained, but late uploads must not mutate a locked event.
	if (event.is_locked) return false;
	await tx`INSERT INTO gate_event_events(event_id,gate_event_id) VALUES(${event.id},${passId}) ON CONFLICT DO NOTHING`;
	if (assignment.stage_id !== null) {
		await tx`INSERT INTO finish_events(stage_id,timestamp,tag) VALUES(${assignment.stage_id},${timestamp},${tag}) ON CONFLICT DO NOTHING`;
		return true;
	}
	return false;
}
