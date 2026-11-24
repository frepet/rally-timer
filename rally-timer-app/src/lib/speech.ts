// Browser-only. Never call at module init time — only from event handlers or effects.

import { getLocale } from '$lib/stores/locale.svelte';

function createUtterance(text: string): SpeechSynthesisUtterance {
	const utter = new SpeechSynthesisUtterance(text);
	// Setting `lang` alone steers the engine's pronunciation even when no
	// exact-match voice is installed, so it must match the text's language.
	const lang = getLocale() === 'sv' ? 'sv-SE' : 'en-US';
	utter.lang = lang;
	const voices = speechSynthesis.getVoices();
	const voice =
		voices.find((v) => v.lang === lang) ??
		voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
	if (voice) utter.voice = voice;
	utter.rate = 1;
	utter.pitch = 1.0;
	return utter;
}

export function speak(text: string): void {
	speechSynthesis.speak(createUtterance(text));
}

// Call from a user-gesture handler so later utterances (driven by events, not
// a click) are allowed to play.
export function primeSpeech(): void {
	speechSynthesis.speak(createUtterance(''));
}
