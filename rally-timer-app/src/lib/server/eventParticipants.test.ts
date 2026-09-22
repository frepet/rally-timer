import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const m = vi.hoisted(() => ({
	query: vi.fn(async () => []),
	context: vi.fn(async () => ({ id: 42 }))
}));
vi.mock('./db', () => {
	const sql = Object.assign((...a: unknown[]) => m.query(...(a as [])), {
		begin: async (f: (q: unknown) => unknown) => f(sql)
	});
	return { sql };
});
vi.mock('./keycloak', () => ({ throwIfNotAdmin: vi.fn() }));
vi.mock('./eventContext', () => ({ requireStageEvent: m.context, requireMutableEvent: m.context }));
import { POST as start } from '../../routes/api/start/+server';
import { POST as heat } from '../../routes/api/rallycross/heat/+server';
function req(body: unknown): RequestEvent {
	return {
		url: new URL('http://localhost/?event_id=42'),
		request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) })
	} as RequestEvent;
}
describe('participant admission', () => {
	it('rejects a manual start for a driver outside the event', async () => {
		const res = await start(req({ stage_id: 1, driver_id: 99 }));
		expect(res.status).toBe(400);
	});
	it('rejects a heat containing a driver outside the event', async () => {
		await expect(heat(req({ driver_ids: [99] }))).rejects.toMatchObject({ status: 400 });
	});
});
