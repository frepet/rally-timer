import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('jose', () => ({
	createRemoteJWKSet: () => ({}),
	jwtVerify: vi.fn()
}));

import { jwtVerify } from 'jose';
import {
	verifyJwt,
	hasRealmRole,
	hasClientRole,
	getBearer,
	requireAdmin,
	CLIENT_ID,
	type KCPayload
} from './keycloak';

const mockVerify = jwtVerify as unknown as Mock;

function evt(auth?: string): RequestEvent {
	return {
		request: { headers: new Headers(auth ? { authorization: auth } : {}) }
	} as unknown as RequestEvent;
}

function payload(over: Partial<KCPayload> = {}): KCPayload {
	return { azp: CLIENT_ID, ...over };
}

beforeEach(() => mockVerify.mockReset());

describe('verifyJwt azp enforcement', () => {
	it('accepts a token issued for this client', async () => {
		mockVerify.mockResolvedValue({ payload: payload() });
		await expect(verifyJwt('t')).resolves.toMatchObject({ azp: CLIENT_ID });
	});

	it('rejects a token minted for another realm client', async () => {
		mockVerify.mockResolvedValue({ payload: payload({ azp: 'some-other-client' }) });
		await expect(verifyJwt('t')).rejects.toThrow();
	});
});

describe('role helpers', () => {
	it('hasClientRole / hasRealmRole', () => {
		const p = payload({
			resource_access: { [CLIENT_ID]: { roles: ['admin'] } },
			realm_access: { roles: ['offline_access'] }
		});
		expect(hasClientRole(p, CLIENT_ID, 'admin')).toBe(true);
		expect(hasClientRole(p, CLIENT_ID, 'nope')).toBe(false);
		expect(hasRealmRole(p, 'offline_access')).toBe(true);
		expect(hasRealmRole(p, 'admin')).toBe(false);
	});

	it('getBearer extracts the token', () => {
		expect(getBearer(evt('Bearer abc'))).toBe('abc');
		expect(getBearer(evt())).toBeNull();
	});
});

describe('requireAdmin', () => {
	it('401 without a bearer token', async () => {
		const r = await requireAdmin(evt());
		expect(r).toMatchObject({ ok: false, status: 401 });
	});

	it('accepts the rally-timer client admin role', async () => {
		mockVerify.mockResolvedValue({
			payload: payload({ resource_access: { [CLIENT_ID]: { roles: ['admin'] } } })
		});
		expect(await requireAdmin(evt('Bearer t'))).toMatchObject({ ok: true });
	});

	it('accepts a realm admin role', async () => {
		mockVerify.mockResolvedValue({ payload: payload({ realm_access: { roles: ['admin'] } }) });
		expect(await requireAdmin(evt('Bearer t'))).toMatchObject({ ok: true });
	});

	it('403 for a valid non-admin token', async () => {
		mockVerify.mockResolvedValue({ payload: payload() });
		expect(await requireAdmin(evt('Bearer t'))).toMatchObject({ ok: false, status: 403 });
	});

	it('401 when the token is rejected for wrong azp', async () => {
		mockVerify.mockResolvedValue({ payload: payload({ azp: 'evil-client' }) });
		expect(await requireAdmin(evt('Bearer t'))).toMatchObject({ ok: false, status: 401 });
	});
});
