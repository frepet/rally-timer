/** Returns championship points for a finishing position using the inverse system:
 *  1st = N, 2nd = N-1, ..., last = 1, where N is the number of starters in the class. */
export function positionToPoints(position: number, totalDrivers: number): number {
	if (position < 1 || totalDrivers < 1 || position > totalDrivers) return 0;
	return totalDrivers - position + 1;
}
