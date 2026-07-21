import { assignPositionsAndDeltas, type StageData } from '../results';

export type SubmittedRallyResult = {
	driver_uuid: string;
	driver_name: string;
	class_name: string;
	stage_name: string;
	stage_order?: number;
	elapsed_ms: number | null;
	dnf: boolean;
	synthetic?: boolean;
};

export function buildStageData(results: SubmittedRallyResult[]): StageData[] {
	const hasOrder = results.some((r) => r.stage_order != null);
	const stageNames = [...new Set(results.map((r) => r.stage_name))];
	if (hasOrder) {
		const orderByStage = new Map(results.map((r) => [r.stage_name, r.stage_order ?? 0]));
		stageNames.sort((a, b) => (orderByStage.get(a) ?? 0) - (orderByStage.get(b) ?? 0));
	} else {
		stageNames.sort();
	}
	return stageNames.map((stageName) => {
		const rows = results
			.filter((r) => r.stage_name === stageName && r.elapsed_ms != null)
			.map((r) => ({
				driver_uuid: r.driver_uuid,
				driver_name: r.driver_name,
				class_name: r.class_name,
				stage_ms: r.elapsed_ms as number,
				penalty_ms: 0,
				delta_p1: null,
				delta_prev: null,
				position: 0,
				dnf: r.dnf,
				synthetic: r.synthetic ?? false
			}));
		rows.sort((a, b) => a.stage_ms - b.stage_ms);
		assignPositionsAndDeltas(rows, (r) => r.stage_ms);
		return { name: stageName, status: 'closed' as const, rows };
	});
}
