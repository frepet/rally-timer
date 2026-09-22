import { expect, it } from 'vitest';
import { assignmentAt, gateAssignmentError } from './gateOwnership';
it('routes delayed passes to the historical event and excludes release boundary', () => {
	const rows = [
		{ event_id: 1, stage_id: 2, assigned_at: 10, released_at: 20 },
		{ event_id: 3, stage_id: null, assigned_at: 20, released_at: null }
	];
	expect(assignmentAt(rows, 19)?.event_id).toBe(1);
	expect(assignmentAt(rows, 20)?.event_id).toBe(3);
	expect(assignmentAt(rows, 9)).toBeNull();
});
it('blocks occupied gates even within the same event when a different stage claims them', () => {
	const row = { event_id: 1, stage_id: 2, assigned_at: 10, released_at: null };
	expect(gateAssignmentError(row, 1, 2)).toBeNull();
	expect(gateAssignmentError(row, 1, 3)).toBeTruthy();
	expect(gateAssignmentError(row, 2, null)).toBeTruthy();
	expect(gateAssignmentError(null, 2, null)).toBeNull();
});
