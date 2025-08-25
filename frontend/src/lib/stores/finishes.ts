import { writable } from 'svelte/store';

export interface FinishEvent {
  id: string,
  ts_utc: Date;
}

function createQueueStore() {
  const { subscribe, update } = writable<FinishEvent[]>([]);

  return {
    subscribe,
    push: (event: FinishEvent) => update(queue => [...queue, event]),
    clear: () => update(() => [])
  };
}

export const finishes = createQueueStore();
