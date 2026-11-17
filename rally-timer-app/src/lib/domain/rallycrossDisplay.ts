import {
	heatElapsedMs,
	heatResultComparator,
	type OverallResult,
	type HeatResult
} from './rallycross';
import { positionToPoints } from './scoring';
import { computeRallycrossRatings } from './ratings';

export type RxHeatEntryDisplay = {
	driver_uuid: string | null;
	driver_name: string;
	class_name: string;
	position: number;
	dnf: boolean;
	/** Finishers: total time. DNF: time of the last completed lap. */
	total_ms: number | null;
	best_lap_ms: number | null;
	/** Completed laps; null when unknown (submitted results). */
	lap_count: number | null;
	/** Gap to the driver ahead when on the same lap count, else 0; null when unknown. */
	delta_ms: number | null;
	/** Rating change from this heat; null until ratings are applied. */
	rating_delta: number | null;
};

export type RxHeatDisplay = {
	number: number;
	entries: RxHeatEntryDisplay[];
};

export type RxStandingDisplay = {
	driver_uuid: string | null;
	driver_name: string;
	class_name: string;
	total_points: number;
	best_total_ms: number | null;
	best_lap_ms: number | null;
	/** Rating after the event and the change over the whole event; null until ratings are applied. */
	rating: number | null;
	rating_delta: number | null;
};

export type RxDisplay = {
	standings: RxStandingDisplay[];
	heats: RxHeatDisplay[];
};

/** Ranks one heat's results (finishers, then DNF/unfinished by laps) and computes deltas. */
export function rankHeatEntries(
	entries: Array<{
		result: HeatResult;
		driver_name: string;
		class_name: string;
		driver_uuid?: string | null;
	}>
): RxHeatEntryDisplay[] {
	const sorted = [...entries].sort((a, b) => heatResultComparator(a.result, b.result));
	let prev: { group: number; ms: number | null } | null = null;
	return sorted.map((e, i) => {
		const ms = e.result.finished ? e.result.total_ms : heatElapsedMs(e.result);
		// Drivers are only comparable when they completed the same number of laps.
		const group = e.result.finished ? -1 : e.result.lap_count;
		const delta_ms =
			prev && prev.group === group && prev.ms !== null && ms !== null ? ms - prev.ms : 0;
		prev = { group, ms };
		return {
			driver_uuid: e.driver_uuid ?? null,
			driver_name: e.driver_name,
			class_name: e.class_name,
			position: i + 1,
			dnf: e.result.dnf,
			total_ms: ms,
			best_lap_ms: e.result.best_lap_ms,
			lap_count: e.result.lap_count,
			delta_ms,
			rating_delta: null
		};
	});
}

export function buildRxDisplay(leaderboard: OverallResult[]): RxDisplay {
	const standings: RxStandingDisplay[] = leaderboard.map((r) => ({
		driver_uuid: r.driver_uuid || null,
		driver_name: r.driver_name,
		class_name: r.class_name,
		total_points: r.total_points,
		best_total_ms: r.best_total_ms,
		best_lap_ms: r.best_lap_ms,
		rating: null,
		rating_delta: null
	}));

	const heatMap = new Map<
		number,
		Array<{
			result: HeatResult;
			driver_name: string;
			class_name: string;
			driver_uuid: string | null;
		}>
	>();
	for (const driver of leaderboard) {
		for (const hr of driver.heat_results) {
			const arr = heatMap.get(hr.heat_number) ?? [];
			arr.push({
				result: hr,
				driver_name: driver.driver_name,
				class_name: driver.class_name,
				driver_uuid: driver.driver_uuid || null
			});
			heatMap.set(hr.heat_number, arr);
		}
	}

	const heats: RxHeatDisplay[] = [...heatMap.entries()]
		.sort(([a], [b]) => b - a)
		.map(([number, entries]) => {
			return { number, entries: rankHeatEntries(entries) };
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
		driver_uuid?: string;
		heat_position?: number | null;
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
		{
			points: number;
			class_name: string;
			driver_uuid: string | null;
			best_total_ms: number | null;
			best_lap_ms: number | null;
		}
	>();

	const heats: RxHeatDisplay[] = [...heatMap.entries()]
		.sort(([a], [b]) => b - a)
		.map(([number, entries]) => {
			const sorted = [...entries].sort((a, b) => {
				// Submissions made after heat_position was introduced keep the exact heat order.
				if (a.heat_position != null && b.heat_position != null)
					return a.heat_position - b.heat_position;
				if (a.dnf && b.dnf) return a.driver_name.localeCompare(b.driver_name);
				if (a.dnf) return 1;
				if (b.dnf) return -1;
				const byTime = (a.elapsed_ms ?? 0) - (b.elapsed_ms ?? 0);
				return byTime !== 0 ? byTime : a.driver_name.localeCompare(b.driver_name);
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
						driver_uuid: e.driver_uuid ?? null,
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
						driver_uuid: e.driver_uuid ?? prev.driver_uuid,
						best_total_ms: newBestTotal,
						best_lap_ms: newBestLap
					});
					return {
						driver_uuid: e.driver_uuid ?? null,
						driver_name: e.driver_name,
						class_name: e.class_name,
						position,
						dnf: e.dnf,
						total_ms: e.elapsed_ms,
						best_lap_ms: e.best_lap_ms,
						lap_count: null,
						delta_ms: null,
						rating_delta: null
					};
				})
			};
		});

	const standings: RxStandingDisplay[] = [...driverMap.entries()]
		.map(([driver_name, { points, class_name, driver_uuid, best_total_ms, best_lap_ms }]) => ({
			driver_uuid,
			driver_name,
			class_name,
			total_points: points,
			best_total_ms,
			best_lap_ms,
			rating: null,
			rating_delta: null
		}))
		.sort((a, b) => b.total_points - a.total_points);

	return { standings, heats };
}

/**
 * Fills in rating changes: per heat for each entry and over the whole event for each
 * standing. Rating deltas are computed all-vs-all by heat position, the same way as
 * when the event is submitted. Drivers without a uuid are left without rating info.
 */
export function applyRxRatings(display: RxDisplay, initialRatings: Map<string, number>): RxDisplay {
	const { finalRatings, heatDeltas } = computeRallycrossRatings(
		display.heats.map((h) => ({
			heat_number: h.number,
			ranked: h.entries.flatMap((e) => (e.driver_uuid ? [e.driver_uuid] : []))
		})),
		initialRatings
	);
	return {
		heats: display.heats.map((h) => ({
			...h,
			entries: h.entries.map((e) => ({
				...e,
				rating_delta: e.driver_uuid ? (heatDeltas.get(h.number)?.get(e.driver_uuid) ?? null) : null
			}))
		})),
		standings: display.standings.map((s) => {
			const rating = s.driver_uuid ? (finalRatings.get(s.driver_uuid) ?? null) : null;
			return {
				...s,
				rating,
				rating_delta:
					rating !== null && s.driver_uuid
						? rating - (initialRatings.get(s.driver_uuid) ?? 1500)
						: null
			};
		})
	};
}
