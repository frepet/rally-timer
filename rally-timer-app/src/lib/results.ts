export type DisplayRallyRow = {
	driver_name: string
	class_name: string
	total_ms: number
	finished_stages: number
	delta_p1: number | null
	delta_prev: number | null
	position: number
}

export type DisplayStageRow = {
	driver_name: string
	class_name: string
	stage_ms: number
	delta_p1: number | null
	delta_prev: number | null
	position: number
}

export type StageData = {
	name: string
	rows: DisplayStageRow[]
}

export function formatMs(ms: number | null | undefined): string {
	if (ms == null) return '—'
	const sec = Math.floor(ms / 1000)
	const m = Math.floor(sec / 60)
	const s = sec % 60
	const cs = Math.floor((ms % 1000) / 10)
	return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function assignPositionsAndDeltas<
	T extends { position: number; delta_p1: number | null; delta_prev: number | null }
>(rows: T[], getTime: (r: T) => number): void {
	let prev: number | null = null
	const p1 = rows.length ? getTime(rows[0]) : null
	rows.forEach((r, i) => {
		r.position = i + 1
		const t = getTime(r)
		r.delta_p1 = p1 != null ? t - p1 : null
		r.delta_prev = prev != null ? t - prev : null
		prev = t
	})
}
