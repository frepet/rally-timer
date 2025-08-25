import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface GatePassing {
  ts: Date;
  gate_id: string;
}

const gatePassingsFilename = 'gatePassings.ndjson';

function parseNdjson(text: string): GatePassing[] {
  if (!text.trim()) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const o = JSON.parse(line);
      return { ts: new Date(o.ts), gate_id: String(o.gate_id) } as GatePassing;
    });
}

function createGatePassings() {
  const { subscribe, set, update } = writable<GatePassing[]>([]);

  // Load from file on creation (client only)
  async function hydrateFromFile() {
    try {
      const res = await fetch('/api/gate-passings');
      if (!res.ok) throw new Error(`GET failed: ${res.status}`);
      const text = await res.text(); // NDJSON
      const items = parseNdjson(text);
      set(items);
    } catch (err) {
      console.error('Failed to load gate passings from file:', err);
      set([]); // fall back to empty
    }
  }

  if (browser) {
    // fire and forget; we don’t block store creation
    hydrateFromFile();
  }

  return {
    subscribe,

    /** Push a new passing. Also appends a NDJSON line to the file on the server. */
    push: async (time: string, gate_id: string) => {
      const record = { ts: new Date(time), gate_id } as GatePassing;

      // Update UI immediately
      update((q) => [...q, record]);

      // Persist on server
      try {
        const res = await fetch('/api/gate-passings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ts: record.ts.toISOString(), gate_id })
        });
        if (!res.ok) {
          console.error('Append failed:', await res.text());
        }
      } catch (err) {
        console.error('Append error:', err);
      }
    },

    /** Clears store in memory AND truncates file on server. */
    clear: async () => {
      set([]);
      try {
        const res = await fetch('/api/gate-passings', { method: 'DELETE' });
        if (!res.ok) {
          console.error('Clear file failed:', await res.text());
        }
      } catch (err) {
        console.error('Clear file error:', err);
      }
    }
  };
}

export const gatePassings = createGatePassings();
export { gatePassingsFilename };
