/** Points awarded per finishing position. Positions not listed receive 0 points. */
export const POINTS_TABLE: Record<number, number> = {
	1: 25,
	2: 18,
	3: 15,
	4: 12,
	5: 10,
	6: 8,
	7: 6,
	8: 4,
	9: 2,
	10: 1
};

/** Returns the championship points for a given finishing position (0 if outside top 10). */
export function positionToPoints(position: number): number {
	return POINTS_TABLE[position] ?? 0;
}
