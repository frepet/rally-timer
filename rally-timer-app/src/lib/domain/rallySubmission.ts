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
};

export type StageTimeResult = {
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	stage_name: string;
	elapsed_ms: number | null;
};

export function buildStageTimes(startRows: StartRow[], finishRows: FinishRow[]): StageTimeResult[] {
	// Build finish lookup: "stage_id:tag" -> timestamp[]
	const finishMap = new Map<string, number[]>();
	for (const fe of finishRows) {
		const key = `${fe.stage_id}:${fe.tag}`;
		const bucket = finishMap.get(key) ?? [];
		bucket.push(fe.timestamp);
		finishMap.set(key, bucket);
	}

	// Group starts by (driver_id, stage_id), keeping driver/stage metadata from any row in the group
	type Group = {
		stage_id: number;
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

	return [...groups.values()].map((g) => {
		const finishes = finishMap.get(`${g.stage_id}:${g.driver_tag}`) ?? [];
		return {
			driver_uuid: g.driver_uuid,
			driver_name: g.driver_name,
			class_id: g.class_id,
			class_name: g.class_name,
			stage_name: g.stage_name,
			elapsed_ms: calculateStageTime(g.starts, finishes)
		};
	});
}
