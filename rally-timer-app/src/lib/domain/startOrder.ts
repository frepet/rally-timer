export type StartOrderDriver = {
	id: number;
	name: string;
	rfid_tag: string;
	class_id: number;
	class_name: string;
	class_start_priority: number;
	total_ms: number | null;
};

export type StartOrderEntry = {
	id: number;
	name: string;
	rfid_tag: string;
	class_id: number;
	class_name: string;
};

export function computeStartOrder(drivers: StartOrderDriver[]): StartOrderEntry[] {
	const sorted = [...drivers].sort((a, b) => {
		if (a.class_start_priority !== b.class_start_priority) {
			return b.class_start_priority - a.class_start_priority;
		}
		if (a.class_name !== b.class_name) {
			return a.class_name.localeCompare(b.class_name);
		}
		const aRanked = a.total_ms !== null;
		const bRanked = b.total_ms !== null;
		if (aRanked !== bRanked) return aRanked ? 1 : -1;
		if (aRanked && bRanked && a.total_ms !== b.total_ms) {
			return (b.total_ms as number) - (a.total_ms as number);
		}
		return a.name.localeCompare(b.name);
	});

	return sorted.map((d) => ({
		id: d.id,
		name: d.name,
		rfid_tag: d.rfid_tag,
		class_id: d.class_id,
		class_name: d.class_name
	}));
}
