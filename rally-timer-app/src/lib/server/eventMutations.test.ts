import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const m = vi.hoisted(() => ({ query: vi.fn(), stage: vi.fn(), release: vi.fn(), assign: vi.fn() }));
vi.mock('./db', () => {
	const sql = Object.assign((...args: unknown[]) => m.query(...args), {
		begin: async (fn: (q: unknown) => unknown) => fn(sql)
	});
	return { sql };
});
vi.mock('./keycloak', () => ({ throwIfNotAdmin: vi.fn() }));
vi.mock('./eventContext', () => ({ requireStageEvent: m.stage }));
vi.mock('./eventGates', () => ({ releaseGate: m.release, assignGate: m.assign }));
import { POST as close } from '../../routes/api/stage/[id]/close/+server';
const request = {
	params: { id: '9' },
	url: new URL('http://localhost/api/stage/9/close?event_id=42')
} as unknown as RequestEvent;
describe('stage closure isolation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.stage.mockResolvedValue({ id: 42 });
		m.query.mockImplementation(async (strings: TemplateStringsArray) => {
			const q = strings.join('?');
			if (q.includes('SELECT id FROM stages WHERE id =')) return [{ id: 9 }];
			if (q.includes('SELECT id FROM gates WHERE stage_id =')) return [{ id: 'gate-two' }];
			return [];
		});
	});
	it('releases gates even when there are no starts', async () => {
		const response = await close(request);
		expect(response.status).toBe(200);
		expect(m.release).toHaveBeenCalledWith(expect.anything(), 'gate-two', 42);
	});
	it('searches for the next open stage only inside this event', async () => {
		await close(request);
		const call = m.query.mock.calls.find((c) => c[0].join('').includes('id >'));
		expect(call).toBeDefined();
		expect(call![0].join('')).toContain('event_id = ');
		expect(call!.slice(1)).toContain(42);
	});
	it('rejects a locked event before any mutation', async () => {
		m.stage.mockRejectedValueOnce(new Error('Event is locked'));
		await expect(close(request)).rejects.toThrow('Event is locked');
		expect(m.query).not.toHaveBeenCalled();
		expect(m.release).not.toHaveBeenCalled();
	});
});
