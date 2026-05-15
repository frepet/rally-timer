// Browser-only. Never call at module init time — only from event handlers or onMount.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
	ctx ??= new AudioContext();
	return ctx;
}

export function playBeep(freq: number, durationSec: number, gain = 0.5): void {
	const audioCtx = getCtx();
	audioCtx.resume().then(() => {
		const osc = audioCtx.createOscillator();
		const gainNode = audioCtx.createGain();
		osc.connect(gainNode);
		gainNode.connect(audioCtx.destination);
		osc.type = 'square';
		osc.frequency.value = freq;
		// 5ms attack, sustain at full gain, 30ms release to avoid click at cutoff
		const t = audioCtx.currentTime;
		const release = 0.03;
		gainNode.gain.setValueAtTime(0, t);
		gainNode.gain.linearRampToValueAtTime(gain, t + 0.005);
		gainNode.gain.setValueAtTime(gain, t + durationSec - release);
		gainNode.gain.linearRampToValueAtTime(0, t + durationSec);
		osc.start(t);
		osc.stop(t + durationSec);
	});
}

// Call from a user-gesture handler before the first scheduled beep fires,
// so the AudioContext is already running by then. Awaitable.
export function primeAudio(): Promise<void> {
	return getCtx().resume();
}

export function getAudioCurrentTime(): number {
	return getCtx().currentTime;
}

// Schedule a beep at an absolute AudioContext time. Returns the oscillator
// so the caller can cancel it with osc.stop(0) before it plays.
export function scheduleBeepAt(
	audioTime: number,
	freq: number,
	durationSec: number,
	gain = 0.5
): OscillatorNode {
	const audioCtx = getCtx();
	const osc = audioCtx.createOscillator();
	const gainNode = audioCtx.createGain();
	osc.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	osc.type = 'square';
	osc.frequency.value = freq;
	const release = 0.03;
	gainNode.gain.setValueAtTime(0, audioTime);
	gainNode.gain.linearRampToValueAtTime(gain, audioTime + 0.005);
	gainNode.gain.setValueAtTime(gain, audioTime + durationSec - release);
	gainNode.gain.linearRampToValueAtTime(0, audioTime + durationSec);
	osc.start(audioTime);
	osc.stop(audioTime + durationSec);
	return osc;
}

export function closeAudio(): void {
	ctx?.close();
	ctx = null;
}
