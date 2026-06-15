import crypto from 'node:crypto';

import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

import { sql } from './db';
import type { GateRegisterInput } from './schemas';

// ---------------------------------------------------------------------------
// Ed25519 signature verification (SEC C1)
// ---------------------------------------------------------------------------

/**
 * Verify an Ed25519 request signature.
 * The signed message is `{timestampMs}\n{body}` encoded as UTF-8.
 * Returns false on any error (invalid base64, wrong length, etc.)
 */
export function verifyGateSignature(
	publicKeyPem: string,
	timestampMs: number,
	body: string,
	signatureB64: string
): boolean {
	try {
		const pubKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem', type: 'spki' });
		const message = Buffer.from(`${timestampMs}\n${body}`);
		const sig = Buffer.from(signatureB64, 'base64');
		return crypto.verify(null, message, pubKey, sig);
	} catch {
		return false;
	}
}

type GateForAuth = {
	public_key: string | null;
	token: string | null;
	status: string;
};

/**
 * Authenticate a gate request using Ed25519 (new gates) or bearer token (legacy).
 *
 * New gates (public_key present):
 *   - status must be 'accepted' → 403 otherwise
 *   - X-Gate-Timestamp within ±60 s → 401 otherwise
 *   - X-Gate-Signature must be a valid Ed25519 sig over `{ts}\n{body}` → 401 otherwise
 *
 * Legacy gates (public_key null, token present):
 *   - falls back to requireGateToken
 *
 * Gates with neither → 403
 */
export async function requireGateCrypto(
	event: RequestEvent,
	gate: GateForAuth,
	body: string
): Promise<void> {
	if (bypassGateAuth()) return;

	if (gate.public_key) {
		if (gate.status !== 'accepted') {
			throw error(403, 'Gate not yet accepted by an admin');
		}

		const tsHeader = event.request.headers.get('x-gate-timestamp');
		const sigHeader = event.request.headers.get('x-gate-signature');

		if (!tsHeader || !sigHeader) {
			throw error(401, 'Missing gate signature headers');
		}

		const ts = Number(tsHeader);
		if (!Number.isInteger(ts) || Math.abs(Date.now() - ts) > 60_000) {
			throw error(401, 'Gate timestamp out of window');
		}

		if (!verifyGateSignature(gate.public_key, ts, body, sigHeader)) {
			throw error(401, 'Invalid gate signature');
		}
		return;
	}

	if (gate.token !== null) {
		requireGateToken(event, gate.token);
		return;
	}

	throw error(403, 'Gate has no authentication credentials');
}

export function generateGateToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

function bypassGateAuth(): boolean {
	// Same dev/e2e escape hatch as the Keycloak helpers; never active in prod.
	return env.SKIP_AUTH === 'true' && env.NODE_ENV !== 'production';
}

function bearerMatches(event: RequestEvent, expected: string): boolean {
	const auth = event.request.headers.get('authorization') || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (presented.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

/**
 * Throws 401 unless the request carries the gate's token. Gates without a
 * token (registered by clients that never requested one) are not enforced,
 * which keeps already-deployed readers working until they are upgraded.
 */
export function requireGateToken(event: RequestEvent, gateToken: string | null): void {
	if (gateToken === null || bypassGateAuth()) return;
	if (!bearerMatches(event, gateToken)) {
		throw error(401, 'Invalid or missing gate token');
	}
}

/**
 * Shared registration logic for POST /api/gate and POST /api/gate/[id].
 *
 * PKI path (public_key present): gate is created as 'pending'; no token issued.
 *   Re-registrations are unauthenticated keepalives (the gate cannot prove its
 *   identity until the admin accepts it, so we just update last_seen).
 *
 * Legacy token path (request_token: true): server generates a token and returns
 *   it once. Subsequent calls must present it.
 */
export async function registerGate(
	event: RequestEvent,
	input: GateRegisterInput
): Promise<Response> {
	const { id, name } = input;
	const publicKey = input.public_key ?? null;
	const requestToken = input.request_token === true;
	const now = Date.now();

	const [existing] = await sql<{ id: string; token: string | null; public_key: string | null }[]>`
		SELECT id, token, public_key FROM gates WHERE id = ${id}
	`;

	// --- PKI path ---
	if (publicKey) {
		if (!existing) {
			await sql`
				INSERT INTO gates (id, name, last_seen, created_at, public_key, status)
				VALUES (${id}, ${name ?? null}, ${now}, ${now}, ${publicKey}, 'pending')
			`;
			return json({ id, registered: true, status: 'pending' }, { status: 201 });
		}
		// Re-registration: update last_seen and name; keep existing status.
		await sql`
			UPDATE gates SET
				name    = COALESCE(${name ?? null}, name),
				last_seen = ${now},
				public_key = ${publicKey}
			WHERE id = ${id}
		`;
		const [updated] = await sql<{ status: string }[]>`SELECT status FROM gates WHERE id = ${id}`;
		return json({ id, registered: true, status: updated?.status ?? 'pending' }, { status: 200 });
	}

	// --- Legacy token path ---
	if (!existing) {
		const token = requestToken ? generateGateToken() : null;
		await sql`
			INSERT INTO gates (id, name, last_seen, created_at, token, status)
			VALUES (${id}, ${name ?? null}, ${now}, ${now}, ${token}, 'accepted')
		`;
		return json({ id, registered: true, ...(token ? { token } : {}) }, { status: 201 });
	}

	if (existing.token) {
		requireGateToken(event, existing.token);
		await sql`
			UPDATE gates SET name = COALESCE(${name ?? null}, name), last_seen = ${now}
			WHERE id = ${id}
		`;
		return json({ id, registered: true }, { status: 200 });
	}

	// Legacy gate without a token: upgrade it if the client now supports tokens.
	const token = requestToken ? generateGateToken() : null;
	await sql`
		UPDATE gates SET
			name   = COALESCE(${name ?? null}, name),
			last_seen = ${now},
			token  = COALESCE(${token}, token)
		WHERE id = ${id}
	`;
	return json({ id, registered: true, ...(token ? { token } : {}) }, { status: 200 });
}
