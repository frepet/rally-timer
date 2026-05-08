import { sv, en } from '../i18n';

export type Locale = 'sv' | 'en';

const locales = { sv, en };

const LS_KEY = 'rally:locale';

function loadLocale(): Locale {
	if (typeof localStorage === 'undefined') return 'sv';
	const stored = localStorage.getItem(LS_KEY);
	return stored === 'en' ? 'en' : 'sv';
}

let locale = $state<Locale>('sv');

export function initLocale() {
	locale = loadLocale();
}

export function setLocale(l: Locale) {
	locale = l;
	localStorage.setItem(LS_KEY, l);
}

export function getLocale(): Locale {
	return locale;
}

export const t = new Proxy({} as typeof sv, {
	get(_, key: string) {
		return locales[locale][key as keyof typeof sv];
	}
});
