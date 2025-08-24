import { writable } from 'svelte/store';

export const finishes = writable<number[]>([]);

// Optional helpers
export function addFinish(n: number) {
  finishes.update(v => [n, ...v]);      // prepend newest
}
export function clearFinishes() {
  finishes.set([]);
}
