import { expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
vi.mock('./db', () => ({ sql: Object.assign(vi.fn(), { begin: vi.fn() }) }));
vi.mock('./keycloak', () => ({ throwIfNotAdmin: vi.fn() }));
vi.mock('./gateAuth', () => ({ registerGate: vi.fn() }));
import { sql } from './db';
import { DELETE } from '../../routes/api/gate/[id]/+server';
it.each(['active', 'history'])('preserves gate when %s data exists', async (kind) => {
	const tx = vi.fn(async (strings: TemplateStringsArray) => {
		const query = strings.join('?');
		if (query.includes('FROM gates')) return [{ id: 'gate' }];
		if (query.includes('gate_assignments') && kind === 'active') return [{ id: 1 }];
		if (query.includes('gate_event_events') && kind === 'history') return [{ id: 1 }];
		return [];
	});
	vi.mocked(sql.begin).mockImplementation(async (fn: unknown) =>
		(fn as (tx: unknown) => Promise<unknown>)(tx)
	);

	await expect(DELETE({ params: { id: 'gate' } } as unknown as RequestEvent)).rejects.toMatchObject(
		{ status: 409 }
	);
	expect(tx.mock.calls.some((c) => c[0].join('?').includes('DELETE FROM gates'))).toBe(false);
});
