// Signal strength is negative dBm, so a positive delta means a stronger read
// than the average and a negative delta a weaker one.

// Below this many reads an average says nothing, so no delta is shown.
export const MIN_RSSI_SAMPLES = 3;

export function meanRssi(values: (number | null | undefined)[]): number | null {
	const present = values.filter((v): v is number => v != null);
	if (present.length < MIN_RSSI_SAMPLES) return null;
	return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export function rssiDelta(rssi: number | null | undefined, mean: number | null): number | null {
	if (rssi == null || mean === null) return null;
	return Math.round(rssi - mean);
}

// "+5", "-5" or "±0"; empty when there is no delta.
export function rssiDeltaText(delta: number | null | undefined): string {
	if (delta == null) return '';
	if (delta === 0) return '±0';
	return delta > 0 ? `+${delta}` : String(delta);
}

// Reads within one deployment scatter by about 4 dB (std dev), so ordinary
// variation stays "ok" and only clearly weaker reads are flagged: roughly
// 1, 2 and 3 standard deviations below the event average.
export type RssiDeltaLevel = 'ok' | 'yellow' | 'orange' | 'red';

export function rssiDeltaLevel(delta: number | null | undefined): RssiDeltaLevel {
	if (delta == null) return 'ok';
	if (delta <= -12) return 'red';
	if (delta <= -8) return 'orange';
	if (delta <= -5) return 'yellow';
	return 'ok';
}
