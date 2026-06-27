export type StageResult = {
	driver_tag: string;
	stage_id: number;
	elapsed_ms: number;
};

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function estimateDnfTime(
	driverTag: string,
	targetStageId: number,
	allResults: StageResult[]
): number | null {
	const driverOtherStages = allResults.filter(
		(r) => r.driver_tag === driverTag && r.stage_id !== targetStageId
	);
	if (driverOtherStages.length === 0) return null;

	const targetStageOthers = allResults.filter(
		(r) => r.stage_id === targetStageId && r.driver_tag !== driverTag
	);
	if (targetStageOthers.length === 0) return null;

	const ratios: number[] = [];
	for (const dr of driverOtherStages) {
		const fieldTimes = allResults
			.filter((r) => r.stage_id === dr.stage_id && r.driver_tag !== driverTag)
			.map((r) => r.elapsed_ms);
		if (fieldTimes.length === 0) continue;
		ratios.push(dr.elapsed_ms / median(fieldTimes));
	}

	if (ratios.length === 0) return null;

	const targetFieldMedian = median(targetStageOthers.map((r) => r.elapsed_ms));
	return Math.round(median(ratios) * targetFieldMedian);
}
