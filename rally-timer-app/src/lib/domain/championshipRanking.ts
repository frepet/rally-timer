export type RallyClassResult = {
	rally_id: string;
	rally_name: string;
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	total_ms: number;
	is_dnf: boolean;
};

export type RankedRallyClassResult = RallyClassResult & { position: number };

/**
 * Within each (rally_id, class_id), assigns positions: finishers first
 * (sorted by total_ms ascending), DNF drivers last. Ties on total_ms
 * are broken by driver_name ascending so positions are deterministic.
 */
export function rankRallyResultsByClass(rows: RallyClassResult[]): RankedRallyClassResult[] {
	const groups = new Map<string, RallyClassResult[]>();
	for (const row of rows) {
		const key = `${row.rally_id}:${row.class_id}`;
		const bucket = groups.get(key) ?? [];
		bucket.push(row);
		groups.set(key, bucket);
	}

	const ranked: RankedRallyClassResult[] = [];
	for (const bucket of groups.values()) {
		const sorted = [...bucket].sort((a, b) => {
			if (a.is_dnf !== b.is_dnf) return a.is_dnf ? 1 : -1;
			if (a.total_ms !== b.total_ms) return a.total_ms - b.total_ms;
			return a.driver_name.localeCompare(b.driver_name);
		});
		sorted.forEach((row, i) => ranked.push({ ...row, position: i + 1 }));
	}
	return ranked;
}
