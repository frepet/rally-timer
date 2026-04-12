export type DisplayRallyRow = {
	driver_name: string;
	class_name: string;
	total_ms: number;
	finished_stages: number;
	delta_p1: number | null;
	delta_prev: number | null;
	position: number;
	dnf: boolean;
};

export type DisplayStageRow = {
	driver_name: string;
	class_name: string;
	stage_ms: number;
	delta_p1: number | null;
	delta_prev: number | null;
	position: number;
	dnf: boolean;
};

export type StageData = {
	name: string;
	rows: DisplayStageRow[];
};

import { rankTimes } from './domain/ranking';

export function formatMs(ms: number | null | undefined): string {
	if (ms == null) return '—';
	const sec = Math.floor(ms / 1000);
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	const cs = Math.floor((ms % 1000) / 10);
	return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function assignPositionsAndDeltas<
	T extends { position: number; delta_p1: number | null; delta_prev: number | null }
>(rows: T[], getTime: (r: T) => number): void {
	const ranked = rankTimes(rows.map(getTime));
	ranked.forEach((entry, i) => {
		rows[i].position = entry.position;
		rows[i].delta_p1 = entry.delta_p1;
		rows[i].delta_prev = entry.delta_prev;
	});
}
