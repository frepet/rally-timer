export type RallyStageRow = {
	rally_id: string;
	rally_name: string;
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	elapsed_ms: number | null;
	dnf: boolean;
};

export type RallyDriverResult = {
	rally_id: string;
	rally_name: string;
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	finished_stages: number;
	total_ms: number;
	is_dnf: boolean;
};

type Rankable = Pick<RallyDriverResult, 'is_dnf' | 'finished_stages' | 'total_ms' | 'driver_name'>;

/**
 * Canonical ranking comparator for rally results.
 * DNF drivers rank after all non-DNF drivers.
 * Among non-DNF: more finished stages rank higher; ties broken by total_ms asc, then name asc.
 */
export function compareRallyDrivers(a: Rankable, b: Rankable): number {
	if (a.is_dnf !== b.is_dnf) return a.is_dnf ? 1 : -1;
	if (a.finished_stages !== b.finished_stages) return b.finished_stages - a.finished_stages;
	if (a.total_ms !== b.total_ms) return a.total_ms - b.total_ms;
	return a.driver_name.localeCompare(b.driver_name);
}

/**
 * Aggregate raw per-stage rows into one entry per (rally_id, class_id, driver_uuid).
 * Replaces SQL-level GROUP BY / SUM / COUNT aggregation.
 */
export function aggregateRallyResults(rows: RallyStageRow[]): RallyDriverResult[] {
	const map = new Map<string, RallyDriverResult>();
	for (const row of rows) {
		const key = `${row.rally_id}:${row.class_id}:${row.driver_uuid}`;
		if (!map.has(key)) {
			map.set(key, {
				rally_id: row.rally_id,
				rally_name: row.rally_name,
				driver_uuid: row.driver_uuid,
				driver_name: row.driver_name,
				class_id: row.class_id,
				class_name: row.class_name,
				finished_stages: 0,
				total_ms: 0,
				is_dnf: false
			});
		}
		const entry = map.get(key)!;
		if (row.elapsed_ms !== null) {
			entry.finished_stages++;
			entry.total_ms += row.elapsed_ms;
		}
		if (row.dnf) entry.is_dnf = true;
	}
	return [...map.values()];
}
