import crypto from 'node:crypto';

import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

import { sql } from './db';
import type { GateRegisterInput } from './schemas';

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
 * Issues a token once per gate when the client asks for one; a gate that has
 * a token must present it to re-register (rename/keepalive).
 */
export async function registerGate(
	event: RequestEvent,
	input: GateRegisterInput
): Promise<Response> {
	const { id, name } = input;
	const requestToken = input.request_token === true;
	const now = Date.now();

	const [existing] = await sql<{ id: string; token: string | null }[]>`
		SELECT id, token FROM gates WHERE id = ${id}
	`;

	if (!existing) {
		const token = requestToken ? generateGateToken() : null;
		await sql`
			INSERT INTO gates (id, name, last_seen, created_at, token)
			VALUES (${id}, ${name ?? null}, ${now}, ${now}, ${token})
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
			name = COALESCE(${name ?? null}, name),
			last_seen = ${now},
			token = COALESCE(${token}, token)
		WHERE id = ${id}
	`;
	return json({ id, registered: true, ...(token ? { token } : {}) }, { status: 200 });
}
