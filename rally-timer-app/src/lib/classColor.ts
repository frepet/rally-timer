// Stable per-class colour for class labels (chips). Colour is derived from the
// class name alone, so every page agrees without looking up the class list.
// Full class strings are listed literally so Tailwind can see them.
const PALETTE = [
	'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
	'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
	'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
	'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
	'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
	'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
	'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
	'bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300'
] as const;

// Sum of code points: names that differ in a single character ("Group A",
// "Group B", "Group S") land on different colours unless the characters
// differ by a multiple of the palette size.
export function classColorIndex(name: string): number {
	let sum = 0;
	for (const ch of name.trim()) sum += ch.codePointAt(0) ?? 0;
	return sum % PALETTE.length;
}

export function classChipClass(name: string | null | undefined): string {
	if (!name) return '';
	return PALETTE[classColorIndex(name)];
}
