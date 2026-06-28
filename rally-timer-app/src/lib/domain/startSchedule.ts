import type { StartOrderEntry } from './startOrder';

export type ScheduledStart = {
	driver_id: number;
	ts_ms: number;
};

/**
 * Turn an ordered start list into scheduled (future) start times.
 *
 * The first driver starts at `startAtMs`, each subsequent slot is `gapMs` later.
 * When `wholeClass` is true, consecutive drivers of the same class share a slot
 * (they are launched together), so the gap applies between classes rather than
 * between individual drivers.
 *
 * Pure — the produced `ts_ms` values become the official `start_events.ts_ms`
 * used by the timing domain, so they ARE the start reference, not an estimate.
 */
export function buildStartSchedule(
	order: StartOrderEntry[],
	startAtMs: number,
	gapMs: number,
	wholeClass: boolean
): ScheduledStart[] {
	const result: ScheduledStart[] = [];
	let slot = 0;
	for (let i = 0; i < order.length; i++) {
		if (i > 0) {
			const sameSlot = wholeClass && order[i].class_id === order[i - 1].class_id;
			if (!sameSlot) slot++;
		}
		result.push({ driver_id: order[i].id, ts_ms: startAtMs + slot * gapMs });
	}
	return result;
}
