import { writable } from 'svelte/store';

export type Pass = { ts_utc: string; gate_id: string } & Record<string, unknown>;

export function createPassStore(initial: Pass[] = []) {
  const { subscribe, set, update } = writable<Pass[]>(initial);
  let es: EventSource | null = null;

  function setInitial(arr: Pass[]) {
    set(arr);
  }

  function startStream(gateId: string) {
    if (typeof window === 'undefined') return; // SSR guard
    es?.close();
    es = new EventSource(`/api/passes/${encodeURIComponent(gateId)}/stream`);
    es.onmessage = (ev) => {
      try {
        const rec = JSON.parse(ev.data);
        update((arr) => [...arr, rec]);
      } catch (e) {
        console.error('bad SSE line', e);
      }
    };
    es.onerror = () => { /* EventSource auto-reconnects */ };
  }

  function stopStream() {
    es?.close();
    es = null;
  }

  return { subscribe, setInitial, startStream, stopStream };
}
