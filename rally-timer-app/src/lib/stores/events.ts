import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ISODateString = string;

/** Minimal event shape; extend with unions later if you want stricter typing */
export interface BaseEvent {
  id?: string;           // may be assigned by server
  ts: ISODateString;     // ISO-8601 (UTC) timestamp from the event source
  src: string;           // device/service name
  type: string;          // e.g., "rfid_blip" | "beam_break" | ...
  payload?: unknown;     // arbitrary JSON payload
  recv_ts?: ISODateString; // server-assigned receive timestamp
}

function parseNdjson(text: string): BaseEvent[] {
  if (!text.trim()) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BaseEvent);
}

function createEventsStore() {
  const { subscribe, set, update } = writable<BaseEvent[]>([]);

  async function hydrate() {
    try {
      const res = await fetch('/api/events', { method: 'GET' });
      if (!res.ok) throw new Error(`GET /api/events failed: ${res.status}`);
      const text = await res.text();          // NDJSON
      const items = parseNdjson(text);
      set(items);
    } catch (err) {
      console.error('Failed to load events:', err);
      set([]);
    }
  }

  if (browser) {
    void hydrate();
  }

  return {
    subscribe,

    /** Append a new event to the log (optimistic in-memory update, then POST). */
    async push(e: Omit<BaseEvent, 'id' | 'recv_ts'>) {
      // Optimistically show it with a provisional id so UI feels instant
      const provisional: BaseEvent = { ...e, id: `prov_${crypto.randomUUID()}` };
      update((q) => [...q, provisional]);

      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(e) // server will add id + recv_ts
        });

        if (!res.ok) {
          console.error('POST /api/events failed:', await res.text());
          return;
        }

        const saved = (await res.json()) as BaseEvent;

        // Reconcile: replace provisional by real (match on provisional fields)
        update((q) => {
          const idx = q.findIndex(
            (x) =>
              x.id === provisional.id ||
              (x.type === e.type && x.ts === e.ts && x.src === e.src)
          );
          if (idx >= 0) {
            const copy = [...q];
            copy[idx] = saved;
            return copy;
          }
          // If not found (e.g., race), just append the server one
          return [...q, saved];
        });
      } catch (err) {
        console.error('POST /api/events error:', err);
      }
    },

    /** Truncate the log on the server and clear the store. */
    async clear() {
      set([]);
      try {
        const res = await fetch('/api/events', { method: 'DELETE' });
        if (!res.ok) console.error('DELETE /api/events failed:', await res.text());
      } catch (err) {
        console.error('DELETE /api/events error:', err);
      }
    }
  };
}

export const events = createEventsStore();

/** Optional helpers so you can write events.rfidBlip(...) etc. */
export const eventHelpers = {
  rfidBlip: (opts: { ts: ISODateString; src: string; tag: string; method?: string }) =>
    events.push({
      ts: opts.ts,
      src: opts.src,
      type: 'rfid_blip',
      payload: { tag: opts.tag, method: opts.method ?? 'unknown' }
    }),
  beamBreak: (opts: { ts: ISODateString; src: string; gate: string; strength?: number }) =>
    events.push({
      ts: opts.ts,
      src: opts.src,
      type: 'beam_break',
      payload: { gate: opts.gate, strength: opts.strength }
    }),
  stageStart: (opts: { ts: ISODateString; src: string; stage: string }) =>
    events.push({ ts: opts.ts, src: opts.src, type: 'stage_start', payload: { stage: opts.stage } }),
  stageEnd: (opts: { ts: ISODateString; src: string; stage: string }) =>
    events.push({ ts: opts.ts, src: opts.src, type: 'stage_end', payload: { stage: opts.stage } })
};
