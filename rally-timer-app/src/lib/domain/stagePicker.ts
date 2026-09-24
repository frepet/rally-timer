// Previous/next navigation for the stage picker. Clamps at the ends: stages
// are chronological, so wrapping from the last back to the first would mislead.
export function stepStage(names: string[], active: string | null, delta: -1 | 1): string | null {
	if (!names.length) return null;
	const i = active === null ? -1 : names.indexOf(active);
	if (i === -1) return names[0];
	return names[Math.min(names.length - 1, Math.max(0, i + delta))];
}
