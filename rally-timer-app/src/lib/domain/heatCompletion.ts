import { computeLaps } from './rallycross';
export function heatIsComplete(
	entries: { tag: string; ts_ms: number; dnf: boolean }[],
	passes: { tag: string; timestamp: number }[],
	requiredLaps: number,
	cooldownMs: number
): boolean {
	return entries
		.filter((e) => !e.dnf)
		.every(
			(entry) =>
				computeLaps(
					passes
						.filter((p) => p.tag === entry.tag && Number(p.timestamp) >= Number(entry.ts_ms))
						.map((p) => Number(p.timestamp)),
					Number(entry.ts_ms),
					cooldownMs
				).length >= requiredLaps
		);
}
