import { heatResultComparator, type OverallResult, type HeatResult } from './rallycross';
import { positionToPoints } from './scoring';

export type RxHeatEntryDisplay = {
	driver_name: string;
	class_name: string;
	position: number;
	dnf: boolean;
	total_ms: number | null;
	best_lap_ms: number | null;
};

export type RxHeatDisplay = {
	number: number;
	entries: RxHeatEntryDisplay[];
};

export type RxStandingDisplay = {
	driver_name: string;
	class_name: string;
	total_points: number;
	best_total_ms: number | null;
	best_lap_ms: number | null;
};

export type RxDisplay = {
	standings: RxStandingDisplay[];
	heats: RxHeatDisplay[];
};

export function buildRxDisplay(leaderboard: OverallResult[]): RxDisplay {
	const standings: RxStandingDisplay[] = leaderboard.map((r) => ({
		driver_name: r.driver_name,
		class_name: r.class_name,
		total_points: r.total_points,
		best_total_ms: r.best_total_ms,
		best_lap_ms: r.best_lap_ms
	}));

	const heatMap = new Map<
		number,
		Array<{ result: HeatResult; driver_name: string; class_name: string }>
	>();
	for (const driver of leaderboard) {
		for (const hr of driver.heat_results) {
			const arr = heatMap.get(hr.heat_number) ?? [];
			arr.push({ result: hr, driver_name: driver.driver_name, class_name: driver.class_name });
			heatMap.set(hr.heat_number, arr);
		}
	}

	const heats: RxHeatDisplay[] = [...heatMap.entries()]
		.sort(([a], [b]) => b - a)
		.map(([number, entries]) => {
			const sorted = [...entries].sort((a, b) => heatResultComparator(a.result, b.result));
			return {
				number,
				entries: sorted.map((e, i) => ({
					driver_name: e.driver_name,
					class_name: e.class_name,
					position: i + 1,
					dnf: e.result.dnf,
					total_ms: e.result.total_ms,
					best_lap_ms: e.result.best_lap_ms
				}))
			};
		});

	return { standings, heats };
}

const RX_STAGE_RE = /^Rallycross heat (\d+)$/;

export function isRallycrossSubmission(results: { stage_name: string }[]): boolean {
	return results.length > 0 && results.some((r) => RX_STAGE_RE.test(r.stage_name));
}

export function buildRxDisplayFromSubmission(
	results: {
		stage_name: string;
		driver_name: string;
		class_name: string;
		elapsed_ms: number | null;
		best_lap_ms: number | null;
		dnf: boolean;
	}[]
): RxDisplay {
	const rxResults = results.filter((r) => RX_STAGE_RE.test(r.stage_name));

	const heatMap = new Map<number, typeof rxResults>();
	for (const r of rxResults) {
		const num = parseInt(RX_STAGE_RE.exec(r.stage_name)![1], 10);
		const arr = heatMap.get(num) ?? [];
		arr.push(r);
		heatMap.set(num, arr);
	}

	const driverMap = new Map<
		string,
		{ points: number; class_name: string; best_total_ms: number | null; best_lap_ms: number | null }
	>();

	const heats: RxHeatDisplay[] = [...heatMap.entries()]
		.sort(([a], [b]) => b - a)
		.map(([number, entries]) => {
			const sorted = [...entries].sort((a, b) => {
				if (a.dnf && b.dnf) return 0;
				if (a.dnf) return 1;
				if (b.dnf) return -1;
				return (a.elapsed_ms ?? 0) - (b.elapsed_ms ?? 0);
			});
			const total = sorted.length;
			return {
				number,
				entries: sorted.map((e, i) => {
					const position = i + 1;
					const pts = e.dnf ? 0 : positionToPoints(position, total);
					const prev = driverMap.get(e.driver_name) ?? {
						points: 0,
						class_name: e.class_name,
						best_total_ms: null,
						best_lap_ms: null
					};
					const newBestTotal =
						e.elapsed_ms !== null &&
						(prev.best_total_ms === null || e.elapsed_ms < prev.best_total_ms)
							? e.elapsed_ms
							: prev.best_total_ms;
					const newBestLap =
						e.best_lap_ms !== null &&
						(prev.best_lap_ms === null || e.best_lap_ms < prev.best_lap_ms)
							? e.best_lap_ms
							: prev.best_lap_ms;
					driverMap.set(e.driver_name, {
						points: prev.points + pts,
						class_name: e.class_name,
						best_total_ms: newBestTotal,
						best_lap_ms: newBestLap
					});
					return {
						driver_name: e.driver_name,
						class_name: e.class_name,
						position,
						dnf: e.dnf,
						total_ms: e.elapsed_ms,
						best_lap_ms: e.best_lap_ms
					};
				})
			};
		});

	const standings: RxStandingDisplay[] = [...driverMap.entries()]
		.map(([driver_name, { points, class_name, best_total_ms, best_lap_ms }]) => ({
			driver_name,
			class_name,
			total_points: points,
			best_total_ms,
			best_lap_ms
		}))
		.sort((a, b) => b.total_points - a.total_points);

	return { standings, heats };
}
