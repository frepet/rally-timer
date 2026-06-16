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
 * Returns false on any error (invalid base64, wrong key format, etc.)
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

function bypassGateAuth(): boolean {
	// Same dev/e2e escape hatch as the Keycloak helpers; never active in prod.
	return env.SKIP_AUTH === 'true' && env.NODE_ENV !== 'production';
}

type GateForAuth = {
	public_key: string | null;
	status: string;
};

/**
 * Authenticate a gate request using Ed25519.
 *
 * - Gate must have a public_key → 403 if not (gate needs to re-register)
 * - status must be 'accepted' → 403 otherwise
 * - X-Gate-Timestamp within ±60 s → 401 otherwise
 * - X-Gate-Signature must be a valid Ed25519 sig over `{ts}\n{body}` → 401 otherwise
 */
export async function requireGateCrypto(
	event: RequestEvent,
	gate: GateForAuth,
	body: string
): Promise<void> {
	if (bypassGateAuth()) return;

	if (!gate.public_key) {
		throw error(403, 'Gate has no public key — please re-register');
	}

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
}

/**
 * Register or re-register a gate.
 * Gates must always supply a public_key (Ed25519 SPKI PEM).
 * New gates are created as 'pending'; re-registration updates last_seen and name
 * while preserving the existing status.
 */
export async function registerGate(
	event: RequestEvent,
	input: GateRegisterInput
): Promise<Response> {
	const { id, name, public_key: publicKey } = input;
	const now = Date.now();

	const [existing] = await sql<{ id: string }[]>`SELECT id FROM gates WHERE id = ${id}`;

	if (!existing) {
		await sql`
			INSERT INTO gates (id, name, last_seen, created_at, public_key, status)
			VALUES (${id}, ${name ?? null}, ${now}, ${now}, ${publicKey}, 'pending')
		`;
		return json({ id, registered: true, status: 'pending' }, { status: 201 });
	}

	await sql`
		UPDATE gates SET
			name      = COALESCE(${name ?? null}, name),
			last_seen = ${now},
			public_key = ${publicKey}
		WHERE id = ${id}
	`;
	const [updated] = await sql<{ status: string }[]>`SELECT status FROM gates WHERE id = ${id}`;
	return json({ id, registered: true, status: updated?.status ?? 'pending' }, { status: 200 });
}
