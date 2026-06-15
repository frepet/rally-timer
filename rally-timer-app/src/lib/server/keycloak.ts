import { error } from '@sveltejs/kit';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '$env/dynamic/private';

export const CLIENT_ID = 'rally-timer';

const DEFAULT_KEYCLOAK_BASE = 'https://keycloak.peteri.se';
const DEFAULT_REALM = 'platform';

let cachedIssuer: string | undefined;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getIssuer(): string {
	cachedIssuer ??= `${env.KEYCLOAK_BASE || DEFAULT_KEYCLOAK_BASE}/realms/${env.KEYCLOAK_REALM || DEFAULT_REALM}`;
	return cachedIssuer;
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
	cachedJwks ??= createRemoteJWKSet(new URL(`${getIssuer()}/protocol/openid-connect/certs`));
	return cachedJwks;
}

export type KCPayload = JWTPayload & {
	preferred_username?: string;
	realm_access?: { roles?: string[] };
	resource_access?: Record<string, { roles?: string[] }>;
	scope?: string;
	azp?: string;
	aud?: string | string[];
	iss?: string;
};

export async function verifyJwt(token: string): Promise<KCPayload> {
	const { payload } = await jwtVerify(token, getJwks(), {
		issuer: getIssuer(),
		// Pin Keycloak's RSA signing algorithm — defence-in-depth against
		// algorithm-substitution even though jose's JWKS resolver already
		// rejects 'none' and HMAC algorithms.
		algorithms: ['RS256']
	});
	const p = payload as KCPayload;
	// Signature + issuer alone accept tokens minted for ANY client in the
	// realm. Keycloak sets azp to the requesting client, so require it.
	if (p.azp !== CLIENT_ID) {
		throw new Error(`Token was not issued for client ${CLIENT_ID}`);
	}
	return p;
}

export function hasRealmRole(p: KCPayload, role: string): boolean {
	return !!p.realm_access?.roles?.includes(role);
}

export function hasClientRole(p: KCPayload, clientId: string, role: string): boolean {
	return !!p.resource_access?.[clientId]?.roles?.includes(role);
}

/** Extract Bearer token or return null */
export function getBearer(event: import('@sveltejs/kit').RequestEvent): string | null {
	const auth = event.request.headers.get('authorization') || '';
	return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Short helper for admin-only write endpoints */
export async function requireAdmin(
	event: import('@sveltejs/kit').RequestEvent
): Promise<{ ok: false; status: number; msg: string } | { ok: true; payload: KCPayload }> {
	const token = getBearer(event);
	if (!token) return { ok: false as const, status: 401, msg: 'Missing Bearer token' };

	try {
		const p = await verifyJwt(token);

		// Accept either the client role rally-timer:admin or a realm admin role
		const ok = hasClientRole(p, CLIENT_ID, 'admin') || hasRealmRole(p, 'admin');

		if (!ok) return { ok: false as const, status: 403, msg: 'Admins only' };

		return { ok: true as const, payload: p };
	} catch {
		return { ok: false as const, status: 401, msg: 'Invalid or expired token' };
	}
}

export async function throwIfNotAdmin(event: import('@sveltejs/kit').RequestEvent): Promise<void> {
	// SKIP_AUTH is a development/e2e escape hatch only; never honour it in
	// a production build even if the variable leaks into the environment.
	if (env.SKIP_AUTH === 'true' && env.NODE_ENV !== 'production') return;
	const r = await requireAdmin(event);
	if (!r.ok) {
		throw error(r.status, r.msg);
	}
}
