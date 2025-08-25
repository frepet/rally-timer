import { writable } from 'svelte/store';

export interface Finish {
  ts: Date;
  gate_id: string;
  id?: string; // RFID tag once matched
}

function createFinishes() {
  const { subscribe, update } = writable<Finish[]>([]);

  return {
    subscribe,

    pushIso: (iso: string, gate_id: string) =>
      update(q => [...q, { ts: new Date(iso), gate_id }]),

    clear: () => update(() => []),

    // Associate a tag to the most recent unassigned finish within a time window
    // stop looking if we find an already assigned finish with the same driver
    associateTag: (tag: string) =>
      update(q => {
        // Find the oldest finish without id within window
        for (let i = 0; i < q.length; i++) {
          if (q[i].id === tag) break; // already assigned, stop looking
          if (!q[i].id) {
            q[i] = { ...q[i], id: tag };
            break;
          }
        }
        return q;
      }),

    // Optional: keep only last N
    trim: (max = 200) =>
      update(q => (q.length > max ? q.slice(q.length - max) : q))
  };
}

export const finishes = createFinishes();
