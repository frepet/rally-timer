import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'node:crypto';

import { verifyGateSignature, requireGateCrypto } from './gateAuth';

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
		const sig = crypto.sign(null, message, otherKeyPair.privateKey).toString('base64');

		expect(verifyGateSignature(testPublicKeyPem, ts, body, sig)).toBe(false);
	});
});

describe('requireGateCrypto', () => {
	const body = '{"epc":"AABBCCDD"}';

	it('passes for accepted gate with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'accepted' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).resolves.toBeUndefined();
	});

	it('throws 403 for gate with no public_key', async () => {
		const gate = { public_key: null, status: 'accepted' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});

	it('throws 403 for pending gate even with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'pending' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});

	it('throws 403 for rejected gate even with valid sig', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'rejected' };
		const event = makeSignedEvt(testKeyPair.privateKey, NOW, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 403 });
	});

	it('throws 401 for stale timestamp (>60s old)', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'accepted' };
		const staleTs = NOW - 61_000;
		const event = makeSignedEvt(testKeyPair.privateKey, staleTs, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 for future timestamp (>60s ahead)', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'accepted' };
		const futureTs = NOW + 61_000;
		const event = makeSignedEvt(testKeyPair.privateKey, futureTs, body);

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 401 for missing signature header', async () => {
		const gate = { public_key: testPublicKeyPem, status: 'accepted' };
		const event = {
			request: {
				headers: new Headers({ 'x-gate-timestamp': String(NOW) })
			}
		} as unknown as RequestEvent;

		await expect(requireGateCrypto(event, gate, body)).rejects.toMatchObject({ status: 401 });
	});
});
