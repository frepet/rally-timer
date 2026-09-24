import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const m = vi.hoisted(() => ({
	locked: false,
	snapshots: 0,
	queries: [] as string[],
	submittedNames: [] as unknown[],
	tail: Promise.resolve()
}));
vi.mock('./db', () => {
	const sql = Object.assign(
		async (strings: TemplateStringsArray, ...values: unknown[]) => {
			const q = strings.join('?');
			m.queries.push(q);
			if (q.includes('FROM events'))
				return [{ id: 42, type: 'rally', name: 'Lunch rally', created_at: 1, is_locked: m.locked }];
			if (q.includes('is_closed AS closed')) return [{ closed: true }];
			if (q.includes('FROM championships')) return [{ id: '5e245b8a-62c2-4b94-adad-806b1cd5cd15' }];
			if (q.includes('INSERT INTO submitted_rallies')) {
				m.submittedNames.push(values[0]);
				m.snapshots++;
				return [{ id: 'snapshot' }];
			}
			if (q.includes('UPDATE events')) m.locked = true;
			return [];
		},
		{
			begin: async (fn: (tx: unknown) => unknown) => {
				let unlock!: () => void;
				const previous = m.tail;
				m.tail = new Promise((resolve) => {
					unlock = resolve;
				});
				await previous;
				try {
					return await fn(sql);
				} finally {
					unlock();
				}
			}
		}
	);
	return { sql };
});
vi.mock('./keycloak', () => ({ throwIfNotAdmin: vi.fn() }));
import { POST } from '../../routes/api/submit-rally/+server';
function request(body: Record<string, unknown> = { name: 'Lunch rally' }): RequestEvent {
	return {
		url: new URL('http://localhost/api/submit-rally?event_id=42'),
		request: new Request('http://localhost', {
			method: 'POST',
			body: JSON.stringify({
				...body,
				championship_ids: ['5e245b8a-62c2-4b94-adad-806b1cd5cd15']
			})
		})
	} as RequestEvent;
}
describe('submission transaction', () => {
	beforeEach(() => {
		m.locked = false;
		m.snapshots = 0;
		m.queries = [];
		m.submittedNames = [];
		m.tail = Promise.resolve();
	});
	it('serializes duplicate submissions and locks after the first immutable snapshot', async () => {
		const results = await Promise.allSettled([POST(request()), POST(request())]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
		expect(m.snapshots).toBe(1);
		expect(m.locked).toBe(true);
		expect(m.queries[0]).toContain('FOR UPDATE');
	});
	it('does not create another snapshot while locked', async () => {
		m.locked = true;
		await expect(POST(request())).rejects.toMatchObject({ status: 409 });
		expect(m.snapshots).toBe(0);
	});
	it('names the submitted result after the event, without asking for a name', async () => {
		await POST(request({}));
		expect(m.submittedNames).toEqual(['Lunch rally']);
	});
	it('ignores a name sent by older clients and keeps the event name', async () => {
		await POST(request({ name: 'Something else' }));
		expect(m.submittedNames).toEqual(['Lunch rally']);
	});
});
