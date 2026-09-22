export type GateAssignment = {
	event_id: number;
	stage_id: number | null;
	assigned_at: number;
	released_at: number | null;
};
export function assignmentAt(rows: GateAssignment[], timestamp: number): GateAssignment | null {
	return (
		rows.find(
			(row) =>
				timestamp >= Number(row.assigned_at) &&
				(row.released_at === null || timestamp < Number(row.released_at))
		) ?? null
	);
}
export function gateAssignmentError(
	current: GateAssignment | null,
	eventId: number,
	stageId: number | null
): string | null {
	return current && (current.event_id !== eventId || current.stage_id !== stageId)
		? 'Gate is assigned elsewhere; disconnect it first'
		: null;
}
