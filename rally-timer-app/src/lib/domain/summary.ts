import { calculateStageTime } from './timing';
import {
	assignPositionsAndDeltas,
	type DisplayRallyRow,
	type DisplayStageRow,
	type StageData
} from '../results';

export type SummaryDriver = {
	id: number;
	name: string;
	class_name: string;
	rfid_tag: string | number | null;
};

export type SummaryStage = {
	id: number;
	name: string;
};

export type SummaryStartEvent = {
	driver_id: number;
	stage_id: number;
	ts: number | string;
};

export type SummaryFinishEvent = {
	stage_id: number;
	tag: string | number;
	ts: number | string;
	dnf?: boolean;
};

export function buildStageData(
	drivers: SummaryDriver[],
	stages: SummaryStage[],
	starts: SummaryStartEvent[],
	finishes: SummaryFinishEvent[]
): StageData[] {
	return stages.map((stage) => {
		const rows: DisplayStageRow[] = drivers.flatMap((driver) => {
			if (driver.rfid_tag == null) return [];

			const driverStarts = starts
				.filter((se) => se.stage_id === stage.id && se.driver_id === driver.id)
				.map((se) => Number(se.ts));

			const driverFinishes = finishes.filter(
				(fe) => fe.stage_id === stage.id && String(fe.tag) === String(driver.rfid_tag)
			);

			const elapsed = calculateStageTime(
				driverStarts,
				driverFinishes.map((fe) => Number(fe.ts))
			);
			if (elapsed === null) return [];

			// DNF: all valid finishes (after latest start) are synthetic
			const latestStart =
				driverStarts.length > 0 ? driverStarts.reduce((max, s) => (s > max ? s : max)) : 0;
			const validFinishes = driverFinishes.filter((fe) => Number(fe.ts) >= latestStart);
			const dnf = !validFinishes.some((fe) => !fe.dnf);

			return [
				{
					driver_name: driver.name,
					class_name: driver.class_name,
					stage_ms: elapsed,
					delta_p1: null,
					delta_prev: null,
					position: 0,
					dnf
				}
			];
		});

		rows.sort((a, b) => a.stage_ms - b.stage_ms);
		assignPositionsAndDeltas(rows, (r) => r.stage_ms);
		return { name: stage.name, rows };
	});
}

export function buildRallyRows(stageData: StageData[]): DisplayRallyRow[] {
	const totals = new Map<
		string,
		{ class_name: string; total: number; finished: number; dnf: boolean }
	>();

	for (const stage of stageData) {
		for (const row of stage.rows) {
			const existing = totals.get(row.driver_name) ?? {
				class_name: row.class_name,
				total: 0,
				finished: 0,
				dnf: false
			};
			existing.total += row.stage_ms;
			if (!row.dnf) existing.finished++;
			if (row.dnf) existing.dnf = true;
			totals.set(row.driver_name, existing);
		}
	}

	const rows: DisplayRallyRow[] = [...totals.entries()].map(([name, v]) => ({
		driver_name: name,
		class_name: v.class_name,
		total_ms: v.total,
		finished_stages: v.finished,
		delta_p1: null,
		delta_prev: null,
		position: 0,
		dnf: v.dnf
	}));

	rows.sort((a, b) => a.total_ms - b.total_ms);
	assignPositionsAndDeltas(rows, (r) => r.total_ms);
	return rows;
}
