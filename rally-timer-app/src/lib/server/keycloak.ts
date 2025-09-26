import { error } from '@sveltejs/kit';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const KEYCLOAK_BASE = 'https://keycloak.peteri.se';
const REALM = 'platform';
export const CLIENT_ID = 'rally-timer';

const ISSUER = `${KEYCLOAK_BASE}/realms/${REALM}`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`));

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
	const { payload } = await jwtVerify(token, JWKS, {
		issuer: ISSUER
	});
	return payload as KCPayload;
}

export function hasRealmRole(p: KCPayload, role: string) {
	return !!p.realm_access?.roles?.includes(role);
}

export function hasClientRole(p: KCPayload, clientId: string, role: string) {
	return !!p.resource_access?.[clientId]?.roles?.includes(role);
}

/** Extract Bearer token or return null */
export function getBearer(event: import('@sveltejs/kit').RequestEvent) {
	const auth = event.request.headers.get('authorization') || '';
	return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Short helper for admin-only write endpoints */
export async function requireAdmin(event: import('@sveltejs/kit').RequestEvent) {
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

export async function throwIfNotAdmin(event: import('@sveltejs/kit').RequestEvent) {
	const r = await requireAdmin(event);
	if (!r.ok) {
		throw error(r.status, r.msg);
	}
}
