import type { StageTimeResult } from './rallySubmission';

export const DNF_PENALTY_MS = 30_000;
export const DNF_FALLBACK_MS = 600_000; // used when no finisher exists in the class

export type StageTimeResultWithDnf = Omit<StageTimeResult, 'elapsed_ms'> & {
	elapsed_ms: number;
	dnf: boolean;
};

export function dnfPenaltyMs(slowestInClassMs: number | undefined): number {
	return slowestInClassMs !== undefined ? slowestInClassMs + DNF_PENALTY_MS : DNF_FALLBACK_MS;
}

export function applyDnfPenalties(results: StageTimeResult[]): StageTimeResultWithDnf[] {
	// Find slowest finisher elapsed_ms per (stage_name, class_id)
	const slowest = new Map<string, number>();
	for (const r of results) {
		if (r.elapsed_ms === null) continue;
		const key = `${r.stage_name}:${r.class_id}`;
		const current = slowest.get(key);
		if (current === undefined || r.elapsed_ms > current) {
			slowest.set(key, r.elapsed_ms);
		}
	}

	return results.map((r) => {
		if (r.elapsed_ms !== null) {
			return { ...r, elapsed_ms: r.elapsed_ms, dnf: false };
		}
		const key = `${r.stage_name}:${r.class_id}`;
		return { ...r, elapsed_ms: dnfPenaltyMs(slowest.get(key)), dnf: true };
	});
}
