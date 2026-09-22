import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const mocks = vi.hoisted(() => ({
	sql: vi.fn(async () => []),
	requireEvent: vi.fn(async () => ({ id: 42, type: 'rally', is_locked: false }))
}));
vi.mock('./db', () => ({ sql: mocks.sql }));
vi.mock('./eventContext', () => ({ requireEvent: mocks.requireEvent }));
import { GET } from '../../routes/api/bundle/+server';
describe('event bundle isolation', () => {
	beforeEach(() => vi.clearAllMocks());
	it('requires an explicit event and binds it to every workspace query', async () => {
		const url = new URL('http://localhost/api/bundle?event_id=42');
		await GET({ url } as RequestEvent);
		expect(mocks.requireEvent).toHaveBeenCalledWith(url, 'rally');
		expect(mocks.sql).toHaveBeenCalledTimes(4);
		for (const call of mocks.sql.mock.calls as unknown[][]) expect(call.slice(1)).toContain(42);
	});
	it('does not query workspace rows when event selection is invalid', async () => {
		mocks.requireEvent.mockRejectedValueOnce(new Error('event_id required'));
		await expect(
			GET({ url: new URL('http://localhost/api/bundle') } as RequestEvent)
		).rejects.toThrow('event_id required');
		expect(mocks.sql).not.toHaveBeenCalled();
	});
});
