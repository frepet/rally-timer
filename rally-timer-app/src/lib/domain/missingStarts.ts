export type StartPair = { driver_id: number; stage_id: number };

/**
 * Given the set of (driver_id, stage_id) start pairs that exist, returns all
 * pairs that are missing: every driver who has at least one start should have
 * a start in every stage that has at least one start.
 */
export function findMissingStarts(starts: StartPair[]): StartPair[] {
	if (starts.length === 0) return [];

	const stageIds = [...new Set(starts.map((s) => s.stage_id))];
	const driverIds = [...new Set(starts.map((s) => s.driver_id))];
	const existing = new Set(starts.map((s) => `${s.driver_id}:${s.stage_id}`));

	const missing: StartPair[] = [];
	for (const driverId of driverIds) {
		for (const stageId of stageIds) {
			if (!existing.has(`${driverId}:${stageId}`)) {
				missing.push({ driver_id: driverId, stage_id: stageId });
			}
		}
	}
	return missing;
}
