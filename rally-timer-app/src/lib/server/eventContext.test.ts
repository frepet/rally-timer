import { beforeEach, expect, it, vi, type Mock } from 'vitest';
vi.mock('./db', () => ({ sql: vi.fn() }));
import { sql, type Sql } from './db';
import { requireEvent, requireMutableEvent, requireStageEvent, getEvent } from './eventContext';
const query = sql as unknown as Mock;
const row = { id: 1, type: 'rally', name: 'A', created_at: '123', is_locked: false };
beforeEach(() => query.mockReset());
it('refuses omitted or invalid event selection without issuing a query', async () => {
	for (const suffix of ['', '?event_id=0', '?event_id=nan', '?event_id=1.5'])
		await expect(requireEvent(new URL(`https://example.test/${suffix}`))).rejects.toMatchObject({
			status: 400
		});
	expect(query).not.toHaveBeenCalled();
});
it('rejects wrong event type and locked mutations', async () => {
	query.mockResolvedValue([{ ...row, type: 'training' }]);
	await expect(
		requireEvent(new URL('https://example.test/?event_id=1'), 'rally')
	).rejects.toMatchObject({ status: 400 });
	query.mockResolvedValue([{ ...row, is_locked: true }]);
	await expect(
		requireMutableEvent(new URL('https://example.test/?event_id=1'))
	).rejects.toMatchObject({ status: 409 });
});
it('derives event from stage and validates event lock', async () => {
	query
		.mockResolvedValueOnce([{ event_id: 1 }])
		.mockResolvedValueOnce([{ ...row, is_locked: true }]);
	await expect(requireStageEvent(7, true)).rejects.toMatchObject({ status: 409 });
});
it('takes row lock within a transaction to serialize submission and writes', async () => {
	const tx = vi.fn().mockResolvedValue([row]);
	expect((await getEvent(1, tx as unknown as Sql)).created_at).toBe(123);
	expect(tx.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
});
