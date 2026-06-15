import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'node:crypto';

import {
	generateGateToken,
	requireGateToken,
	verifyGateSignature,
	requireGateCrypto
} from './gateAuth';

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

// ---------------------------------------------------------------------------
// Ed25519 / SEC C1 enrollment tests
// ---------------------------------------------------------------------------

const testKeyPair = crypto.generateKeyPairSync('ed25519');
const testPublicKeyPem = testKeyPair.publicKey.export({ format: 'pem', type: 'spki' }) as string;

/**
 * Build a fake RequestEvent whose headers contain a valid Ed25519 signature
 * over `${ts}\n${body}` using the given private key.
 */
function makeSignedEvt(
	privateKey: crypto.KeyObject,
	ts: number,
	body: string,
	extraHeaders?: Record<string, string>
): RequestEvent {
	const message = Buffer.from(`${ts}\n${body}`);
	const sig = crypto.sign(null, message, privateKey).toString('base64');
	return {
		request: {
			headers: new Headers({
				'x-gate-timestamp': String(ts),
				'x-gate-signature': sig,
				...extraHeaders
			})
		}
	} as unknown as RequestEvent;
}

const NOW = Date.now();

describe('verifyGateSignature', () => {
	it('accepts a valid Ed25519 signature', () => {
		const body = '{"epc":"AABBCCDD"}';
		const ts = NOW;
		const message = Buffer.from(`${ts}\n${body}`);
		const sig = crypto.sign(null, message, testKeyPair.privateKey).toString('base64');

		expect(verifyGateSignature(testPublicKeyPem, ts, body, sig)).toBe(true);
	});

	it('rejects a corrupted signature', () => {
		const body = '{"epc":"AABBCCDD"}';
		const ts = NOW;
		const message = Buffer.from(`${ts}\n${body}`);
		const sig = crypto.sign(null, message, testKeyPair.privateKey).toString('base64');
		// Flip the first character — this always affects decoded bytes (not padding)
		const corrupted = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);

		expect(verifyGateSignature(testPublicKeyPem, ts, body, corrupted)).toBe(false);
	});

	it('rejects wrong key', () => {
		const body = '{"epc":"AABBCCDD"}';
		const ts = NOW;
		const otherKeyPair = crypto.generateKeyPairSync('ed25519');
		const message = Buffer.from(`${ts}\n${body}`);
		// Sign with a different private key
		const sig = crypto.sign(null, message, otherKeyPair.privateKey).toString('base64');

		expect(verifyGateSignature(testPublicKeyPem, ts, body, sig)).toBe(false);
	});
});

describe('requireGateCrypto', () => {
	const body = '{"epc":"AABBCCDD"}';

	it('passes for accepted gate with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'accepted' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).resolves.toBeUndefined();
	});

	it('throws 403 for pending gate even with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'pending' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});

	it('throws 403 for rejected gate even with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'rejected' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});

	it('throws 401 for stale timestamp (>60s old)', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'accepted' };
		const staleTs = NOW - 61_000;
		const event = makeSignedEvt(testKeyPair.privateKey, staleTs, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 for future timestamp (>60s ahead)', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'accepted' };
		const futureTs = NOW + 61_000;
		const event = makeSignedEvt(testKeyPair.privateKey, futureTs, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 for missing signature header', async () => {
		const gate = { public_key: testPublicKeyPem, token: null, status: 'accepted' };
		// Provide timestamp but no X-Gate-Signature
		const event = {
			request: {
				headers: new Headers({ 'x-gate-timestamp': String(NOW) })
			}
		} as unknown as RequestEvent;

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});

	it('falls back to token check for legacy gate (no public_key)', async () => {
		const legacyToken = 'c'.repeat(64);
		const gate = { public_key: null, token: legacyToken, status: 'accepted' };
		// A legacy gate has no public key — provide a valid bearer token instead
		const event = {
			request: {
				headers: new Headers({ authorization: `Bearer ${legacyToken}` })
			}
		} as unknown as RequestEvent;

		await expect(requireGateCrypto(event, gate, body)).resolves.toBeUndefined();
	});

	it('throws 403 if gate has neither public_key nor token', async () => {
		const gate = { public_key: null, token: null, status: 'accepted' };
		const event = {
			request: {
				headers: new Headers({})
			}
		} as unknown as RequestEvent;

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});
});
