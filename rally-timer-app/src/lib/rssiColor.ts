import { rssiDeltaLevel } from './domain/rssi';

// Full class strings are listed literally so Tailwind can see them. Normal and
// stronger reads keep the surrounding text colour.
const LEVEL_CLASS = {
	ok: '',
	yellow: 'font-medium text-yellow-600 dark:text-yellow-300',
	orange: 'font-medium text-orange-600 dark:text-orange-400',
	red: 'font-medium text-red-600 dark:text-red-400'
} as const;

export function rssiDeltaClass(delta: number | null | undefined): string {
	return LEVEL_CLASS[rssiDeltaLevel(delta)];
}
