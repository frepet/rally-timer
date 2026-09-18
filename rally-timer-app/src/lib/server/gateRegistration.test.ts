import { expect, it, vi, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('./db', () => ({ sql: vi.fn() }));

import { sql } from './db';
import { registerGate } from './gateAuth';

it('does not overwrite an admin-edited gate name on re-registration', async () => {
	const mockedSql = sql as unknown as Mock;
	mockedSql.mockReset();
	mockedSql.mockResolvedValueOnce([{ id: 'ce728083-32ee-4d99-b97c-437f8300971f' }]);
	mockedSql.mockResolvedValueOnce([]);
	mockedSql.mockResolvedValueOnce([{ status: 'accepted' }]);

	const response = await registerGate({} as RequestEvent, {
		id: 'ce728083-32ee-4d99-b97c-437f8300971f',
		name: 'Gate-ce728083',
		public_key: 'test-public-key'
	});

	expect(response.status).toBe(200);
	const update = mockedSql.mock.calls[1]?.[0].join('?') ?? '';
	expect(update).toMatch(/UPDATE gates SET/);
	expect(update).not.toMatch(/\bname\s*=/);
});
