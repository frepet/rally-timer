export function calculateStageTime(starts: number[], finishes: number[]): number | null {
	if (starts.length === 0) return null
	const start = starts.reduce((max, s) => (s > max ? s : max))
	const validFinishes = finishes.filter((f) => f >= start)
	const finish =
		validFinishes.length > 0 ? validFinishes.reduce((min, f) => (f < min ? f : min)) : null
	if (finish === null) return null
	return finish - start
}
