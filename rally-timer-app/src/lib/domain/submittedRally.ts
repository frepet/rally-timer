import { assignPositionsAndDeltas, type StageData } from '../results';

export type SubmittedRallyResult = {
	driver_name: string;
	class_name: string;
	stage_name: string;
	elapsed_ms: number | null;
	dnf: boolean;
};

export function buildStageData(results: SubmittedRallyResult[]): StageData[] {
	const stageNames = [...new Set(results.map((r) => r.stage_name))];
	return stageNames.map((stageName) => {
		const rows = results
			.filter((r) => r.stage_name === stageName && r.elapsed_ms != null)
			.map((r) => ({
				driver_name: r.driver_name,
				class_name: r.class_name,
				stage_ms: r.elapsed_ms as number,
				penalty_ms: 0,
				delta_p1: null,
				delta_prev: null,
				position: 0,
				dnf: r.dnf
			}));
		rows.sort((a, b) => a.stage_ms - b.stage_ms);
		assignPositionsAndDeltas(rows, (r) => r.stage_ms);
		return { name: stageName, status: 'closed' as const, rows };
	});
}
