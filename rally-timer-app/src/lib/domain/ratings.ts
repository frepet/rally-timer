import type { DisplayStageRow, StageData } from '../results';

const BASE_RATING = 1500;
const K_FACTOR = 32;

// 10% of winning time as the time scale; tanh saturates toward 1 beyond ~3x that.
const MARGIN_SCALE = 0.10;

export type RallyRatings = {
	finalRatings: Map<string, number>;
	stageDeltas: Map<string, Map<string, number>>;
};

// Binary win/loss scaled by time margin so close finishes yield near-zero change.
// Winner is always actual=1 > expected, so winners never get a negative delta.
function pairScoreAndK(
	a: DisplayStageRow,
	b: DisplayStageRow
): { actualA: number; effectiveK: number } {
	if (a.dnf && b.dnf) return { actualA: 0.5, effectiveK: K_FACTOR };
	if (a.dnf) return { actualA: 0, effectiveK: K_FACTOR };
	if (b.dnf) return { actualA: 1, effectiveK: K_FACTOR };

	const winner_ms = Math.min(a.stage_ms, b.stage_ms);
	const gap_ms = Math.abs(a.stage_ms - b.stage_ms);
	const effectiveK = K_FACTOR * Math.tanh(gap_ms / (winner_ms * MARGIN_SCALE));
	const actualA = a.stage_ms <= b.stage_ms ? 1 : 0;
	return { actualA, effectiveK };
}

function processGroup(
	rows: DisplayStageRow[],
	ratings: Map<string, number>,
	deltas: Map<string, number>
) {
	for (let i = 0; i < rows.length; i++) {
		for (let j = i + 1; j < rows.length; j++) {
			const a = rows[i];
			const b = rows[j];
			const rA = ratings.get(a.driver_uuid) ?? BASE_RATING;
			const rB = ratings.get(b.driver_uuid) ?? BASE_RATING;
			const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
			const { actualA, effectiveK } = pairScoreAndK(a, b);
			const actualB = 1 - actualA;
			const expectedB = 1 - expectedA;
			deltas.set(a.driver_uuid, (deltas.get(a.driver_uuid) ?? 0) + effectiveK * (actualA - expectedA));
			deltas.set(b.driver_uuid, (deltas.get(b.driver_uuid) ?? 0) + effectiveK * (actualB - expectedB));
		}
	}
}

export function computeRallyRatings(
	stages: StageData[],
	initialRatings?: Map<string, number>
): RallyRatings {
	const ratings = new Map<string, number>();
	const stageDeltas = new Map<string, Map<string, number>>();

	for (const stage of stages) {
		for (const row of stage.rows) {
			if (!ratings.has(row.driver_uuid)) {
				ratings.set(row.driver_uuid, initialRatings?.get(row.driver_uuid) ?? BASE_RATING);
			}
		}
	}

	for (const stage of stages) {
		if (stage.rows.length < 2) continue;

		const deltas = new Map<string, number>(stage.rows.map((r) => [r.driver_uuid, 0]));

		// Group by class — drivers only compete against their own class
		const byClass = Map.groupBy(stage.rows, (r) => r.class_name);
		for (const group of byClass.values()) {
			if (group.length >= 2) processGroup(group, ratings, deltas);
		}

		const stageDeltasRounded = new Map<string, number>();
		for (const [uuid, delta] of deltas) {
			ratings.set(uuid, (ratings.get(uuid) ?? BASE_RATING) + delta);
			stageDeltasRounded.set(uuid, Math.round(delta));
		}
		stageDeltas.set(stage.name, stageDeltasRounded);
	}

	const finalRatings = new Map<string, number>();
	for (const [uuid, rating] of ratings) finalRatings.set(uuid, Math.round(rating));

	return { finalRatings, stageDeltas };
}
