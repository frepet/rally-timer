import { writable } from 'svelte/store';

export const finishes = writable<number[]>([]);
export const taggedFinishes = writable<[number, number][]>([]);

export function addFinish(n: number) {
  finishes.update(v => [n, ...v]);      // prepend newest
}
export function clearFinishes() {
  finishes.set([]);
}

export function addTaggedFinish(id: number, time: number) {
  finishes.update(v => [(id, time, time), ...v]);      // prepend newest
}
export function clearTaggedFinishes() {
  finishes.set([]);
}
