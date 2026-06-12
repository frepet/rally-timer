import { calculateStageTime } from './timing';
import { compareRallyDrivers } from './rallyResults';
import {
	assignPositionsAndDeltas,
	type DisplayRallyRow,
	type DisplayStageRow,
	type StageData,
	type StageStatus
} from '../results';

export type SummaryDriver = {
	id: number;
	uuid: string;
	name: string;
	class_name: string;
	rfid_tag: string | number | null;
};

export type SummaryStage = {
	id: number;
	name: string;
	is_closed: boolean;
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
	penalty_ms?: number;
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

			const penalty_ms = driverFinishes.reduce((sum, fe) => sum + Number(fe.penalty_ms ?? 0), 0);
			const effectiveTs = (fe: SummaryFinishEvent) => Number(fe.ts) + Number(fe.penalty_ms ?? 0);

			const elapsed = calculateStageTime(driverStarts, driverFinishes.map(effectiveTs));
			if (elapsed === null) return [];

			// DNF: all valid finishes (after latest start) are synthetic
			const latestStart =
				driverStarts.length > 0 ? driverStarts.reduce((max, s) => (s > max ? s : max)) : 0;
			const validFinishes = driverFinishes.filter((fe) => effectiveTs(fe) >= latestStart);
			const dnf = !validFinishes.some((fe) => !fe.dnf);

			return [
				{
					driver_uuid: driver.uuid,
					driver_name: driver.name,
					class_name: driver.class_name,
					stage_ms: elapsed,
					penalty_ms,
					delta_p1: null,
					delta_prev: null,
					position: 0,
					dnf
				}
			];
		});

		rows.sort((a, b) => a.stage_ms - b.stage_ms);
		assignPositionsAndDeltas(rows, (r) => r.stage_ms);

		const hasStarts = starts.some((se) => se.stage_id === stage.id);
		const status: StageStatus = stage.is_closed ? 'closed' : hasStarts ? 'live' : 'upcoming';

		return { name: stage.name, status, rows };
	});
}

export function buildRallyRows(stageData: StageData[]): DisplayRallyRow[] {
	const totals = new Map<
		string,
		{
			driver_name: string;
			class_name: string;
			total: number;
			penalty: number;
			finished: number;
			dnf: boolean;
		}
	>();

	for (const stage of stageData) {
		for (const row of stage.rows) {
			const existing = totals.get(row.driver_uuid) ?? {
				driver_name: row.driver_name,
				class_name: row.class_name,
				total: 0,
				penalty: 0,
				finished: 0,
				dnf: false
			};
			existing.total += row.stage_ms;
			existing.penalty += row.penalty_ms;
			if (!row.dnf) existing.finished++;
			if (row.dnf) existing.dnf = true;
			totals.set(row.driver_uuid, existing);
		}
	}

	const rows: DisplayRallyRow[] = [...totals.entries()].map(([uuid, v]) => ({
		driver_uuid: uuid,
		driver_name: v.driver_name,
		class_name: v.class_name,
		total_ms: v.total,
		penalty_ms: v.penalty,
		finished_stages: v.finished,
		delta_p1: null,
		delta_prev: null,
		position: 0,
		dnf: v.dnf
	}));

	rows.sort((a, b) => compareRallyDrivers({ ...a, is_dnf: a.dnf }, { ...b, is_dnf: b.dnf }));
	assignPositionsAndDeltas(rows, (r) => r.total_ms);
	return rows;
}
