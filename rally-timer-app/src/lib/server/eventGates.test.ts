import { beforeEach, expect, it, vi } from 'vitest';
import type { Sql } from './db';
vi.mock('./db', () => ({ sql: vi.fn() }));
import { assignGate, captureGatePass, releaseGate } from './eventGates';
const event = { id: 1, type: 'rally', name: 'A', created_at: 1, is_locked: false };
let queries: string[];
let locked = false;
let owner = 1;
const tx = vi.fn(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join('?');
	queries.push(query);
	if (query.includes('FROM events')) return [{ ...event, is_locked: locked }];
	if (query.includes('FROM gates')) return [{ id: 'gate' }];
	if (query.includes('FROM gate_assignments'))
		return [{ id: 1, event_id: owner, stage_id: 5, assigned_at: 0, released_at: null }];
	if (query.includes('FROM stages')) return [{ id: 5 }];
	return [];
});
beforeEach(() => {
	queries = [];
	locked = false;
	owner = 1;
	tx.mockClear();
});
it('rejects assigning an occupied gate to a different event without changing ownership', async () => {
	await expect(assignGate(tx as unknown as Sql, 'gate', 2, 5)).rejects.toMatchObject({
		status: 409
	});
	expect(queries.some((q) => q.includes('INSERT INTO gate_assignments'))).toBe(false);
});
it('takes event lock before gate lock for captures and persists original event ownership', async () => {
	expect(await captureGatePass(tx as unknown as Sql, 'gate', 9, 100, 'tag')).toBe(true);
	const eventLock = queries.findIndex((q) => q.includes('FROM events'));
	const gateLock = queries.findIndex((q) => q.includes('FROM gates'));
	expect(eventLock).toBeLessThan(gateLock);
	expect(queries[gateLock]).toContain('FOR NO KEY UPDATE');
	const insert = tx.mock.calls.find((c) =>
		c[0].join('?').includes('INSERT INTO gate_event_events')
	);
	expect(insert?.slice(1)).toEqual([1, 9]);
});
it('locked events retain raw passes without changing captured results', async () => {
	locked = true;
	expect(await captureGatePass(tx as unknown as Sql, 'gate', 9, 100, 'tag')).toBe(false);
	expect(queries.some((q) => q.includes('INSERT INTO'))).toBe(false);
	await expect(releaseGate(tx as unknown as Sql, 'gate', 1)).rejects.toMatchObject({ status: 409 });
});
