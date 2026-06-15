import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

import { generateGateToken, requireGateToken } from './gateAuth';

function evt(auth?: string): RequestEvent {
	return {
		request: { headers: new Headers(auth ? { authorization: auth } : {}) }
	} as unknown as RequestEvent;
}

const TOKEN = 'a'.repeat(64);

describe('generateGateToken', () => {
	it('produces 64 hex chars', () => {
		expect(generateGateToken()).toMatch(/^[0-9a-f]{64}$/);
	});
	it('is unique per call', () => {
		expect(generateGateToken()).not.toBe(generateGateToken());
	});
});

describe('requireGateToken', () => {
	it('allows legacy gates with no token (backward compat)', () => {
		expect(() => requireGateToken(evt(), null)).not.toThrow();
		expect(() => requireGateToken(evt('Bearer whatever'), null)).not.toThrow();
	});

	it('accepts the correct bearer token', () => {
		expect(() => requireGateToken(evt(`Bearer ${TOKEN}`), TOKEN)).not.toThrow();
	});

	it('rejects a wrong token', () => {
		expect(() => requireGateToken(evt(`Bearer ${'b'.repeat(64)}`), TOKEN)).toThrow();
	});

	it('rejects a missing Authorization header', () => {
		expect(() => requireGateToken(evt(), TOKEN)).toThrow();
	});

	it('rejects (does not crash) on a length-mismatched token', () => {
		// timingSafeEqual throws on unequal-length buffers; the length guard must
		// turn this into a clean 401, not a 500.
		expect(() => requireGateToken(evt('Bearer short'), TOKEN)).toThrow();
	});
});
