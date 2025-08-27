type RfidOptions = {
  minLength?: number;        // shortest tag we accept
  idleResetMs?: number;      // reset buffer if no key within this time
  maxBurstMs?: number;       // optional: reject if the whole entry took too long
  terminators?: Array<'Enter' | 'Tab'>;
  allowed?: RegExp;          // which chars to allow
};

export type RfidStopFn = () => void;

export function startRfidWedge(onTag: (tag: string) => void, opts: RfidOptions = {}): RfidStopFn {
  const minLength = opts.minLength ?? 5;
  const idleResetMs = opts.idleResetMs ?? 120;
  const maxBurstMs = opts.maxBurstMs ?? 700;     // humans are slower, readers are fast
  const terminators = opts.terminators ?? ['Enter', 'Tab'];
  const allowed = opts.allowed ?? /^[0-9A-Za-z]$/;

  let buf = '';
  let lastTs = 0;
  let startTs = 0;
  let idleTimer: number | undefined;

  const reset = () => {
    buf = '';
    lastTs = 0;
    startTs = 0;
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const armIdleTimer = () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(reset, idleResetMs);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore if IME/composition or modifier keys are involved
    if (e.isComposing) return;

    // Accept regular single-character keys that match the allowed set
    if (e.key.length === 1 && allowed.test(e.key)) {
      const now = performance.now();
      if (!startTs) startTs = now;
      lastTs = now;
      buf += e.key;
      armIdleTimer();
      return;
    }

    // Terminator => finalize a tag
    if (terminators.includes(e.key as any)) {
      if (buf.length >= minLength) {
        const burst = performance.now() - startTs;
        // Optional burst-time filter
        if (burst <= maxBurstMs) {
          onTag(buf);
          // Prevent accidental form submits if you like:
          // e.preventDefault();
        }
      }
      reset();
      return;
    }

    // Any other non-character key resets if we had started a capture
    if (buf) reset();
  };

  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    reset();
  };
}
