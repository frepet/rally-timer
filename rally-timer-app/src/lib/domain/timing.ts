export function calculateStageTime(starts: number[], finishes: number[]): number | null {
	const start = Math.max(...starts)
	const finish = finishes.find((f) => f >= start)
	if (finish === undefined) return null
	return finish - start
}
