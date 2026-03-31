export type RankedEntry = {
	position: number;
	delta_p1: number;
	delta_prev: number | null;
};

export function rankTimes(times: number[]): RankedEntry[] {
	if (times.length === 0) return [];
	const p1 = times[0];
	let prev: number | null = null;
	return times.map((t, i) => {
		const entry: RankedEntry = {
			position: i + 1,
			delta_p1: t - p1,
			delta_prev: prev !== null ? t - prev : null
		};
		prev = t;
		return entry;
	});
}
