import { calculateStageTime } from './timing';

export type StartRow = {
	driver_id: number;
	stage_id: number;
	ts_ms: number;
	driver_uuid: string;
	driver_name: string;
	driver_tag: string;
	class_id: number;
	class_name: string;
	stage_name: string;
};

export type FinishRow = {
	stage_id: number;
	tag: string;
	timestamp: number;
	penalty_ms: number;
	dnf: boolean;
	synthetic: boolean;
};

export type StageTimeResult = {
	driver_id: number;
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	stage_name: string;
	stage_order: number;
	elapsed_ms: number | null;
	dnf: boolean;
	synthetic: boolean;
};

export function buildStageTimes(startRows: StartRow[], finishRows: FinishRow[]): StageTimeResult[] {
	// Build finish lookup: "stage_id:tag" -> FinishRow[]
	const finishMap = new Map<string, FinishRow[]>();
	for (const fe of finishRows) {
		const key = `${fe.stage_id}:${fe.tag}`;
		const bucket = finishMap.get(key) ?? [];
		bucket.push(fe);
		finishMap.set(key, bucket);
	}

	// Group starts by (driver_id, stage_id), keeping driver/stage metadata from any row in the group
	type Group = {
		stage_id: number;
		driver_id: number;
		driver_uuid: string;
		driver_name: string;
		driver_tag: string;
		class_id: number;
		class_name: string;
		stage_name: string;
		starts: number[];
	};

	const groups = new Map<string, Group>();
	for (const se of startRows) {
		const key = `${se.driver_id}:${se.stage_id}`;
		if (!groups.has(key)) {
			groups.set(key, {
				stage_id: se.stage_id,
				driver_id: se.driver_id,
				driver_uuid: se.driver_uuid,
				driver_name: se.driver_name,
				driver_tag: se.driver_tag,
				class_id: se.class_id,
				class_name: se.class_name,
				stage_name: se.stage_name,
				starts: []
			});
		}
		groups.get(key)!.starts.push(se.ts_ms);
	}

	// Determine chronological stage order from the first start event per stage.
	const stageFirstStart = new Map<number, number>();
	for (const g of groups.values()) {
		const minStart = g.starts.reduce((min, s) => (s < min ? s : min));
		const existing = stageFirstStart.get(g.stage_id);
		if (existing === undefined || minStart < existing) stageFirstStart.set(g.stage_id, minStart);
	}
	const stageOrderMap = new Map<number, number>(
		[...stageFirstStart.entries()]
			.sort(([, a], [, b]) => a - b)
			.map(([stageId], idx) => [stageId, idx])
	);

	return [...groups.values()].map((g) => {
		const finishes = finishMap.get(`${g.stage_id}:${g.driver_tag}`) ?? [];
		const effectiveTs = (fe: FinishRow) => fe.timestamp + fe.penalty_ms;
		const latestStart = g.starts.reduce((max, s) => (s > max ? s : max));
		const validFinishes = finishes.filter((fe) => effectiveTs(fe) >= latestStart);
		const elapsed_ms = calculateStageTime(g.starts, finishes.map(effectiveTs));
		// A result is dnf only when the winning finish is a synthetic DNF finish,
		// i.e. there is no real (dnf=false) valid finish.
		const dnf = elapsed_ms !== null && !validFinishes.some((fe) => !fe.dnf);
		// The winning finish is the earliest valid one — same tie-break as calculateStageTime.
		const winningFinish = validFinishes.reduce<FinishRow | null>(
			(min, fe) => (min === null || effectiveTs(fe) < effectiveTs(min) ? fe : min),
			null
		);
		const synthetic = elapsed_ms !== null && !dnf && (winningFinish?.synthetic ?? false);
		return {
			driver_id: g.driver_id,
			driver_uuid: g.driver_uuid,
			driver_name: g.driver_name,
			class_id: g.class_id,
			class_name: g.class_name,
			stage_name: g.stage_name,
			stage_order: stageOrderMap.get(g.stage_id) ?? 0,
			elapsed_ms,
			dnf,
			synthetic
		};
	});
}
