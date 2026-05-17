import { compareRallyDrivers, type RallyDriverResult } from './rallyResults';

export type { RallyDriverResult };

export type RankedRallyDriverResult = RallyDriverResult & { position: number };

/**
 * Within each (rally_id, class_id), assigns positions using the canonical rally ranking order.
 * Input must already be aggregated per driver (one entry per driver per rally per class).
 */
export function rankRallyResultsByClass(rows: RallyDriverResult[]): RankedRallyDriverResult[] {
	const groups = new Map<string, RallyDriverResult[]>();
	for (const row of rows) {
		const key = `${row.rally_id}:${row.class_id}`;
		const bucket = groups.get(key) ?? [];
		bucket.push(row);
		groups.set(key, bucket);
	}

	const ranked: RankedRallyDriverResult[] = [];
	for (const bucket of groups.values()) {
		const sorted = [...bucket].sort(compareRallyDrivers);
		sorted.forEach((row, i) => ranked.push({ ...row, position: i + 1 }));
	}
	return ranked;
}
