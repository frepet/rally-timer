import { keycloak } from './stores/auth.svelte';

export async function kcFetch(input: RequestInfo, init: RequestInit = {}) {
	// Ensure token is fresh (refresh if expiring in <30s).
	// If refresh fails, clear the stale state and proceed unauthenticated —
	// calling keycloak.login() here would redirect the page and break data fetches
	// for non-admin viewers whose session expired (e.g. admin logged out elsewhere).
	if (keycloak.authenticated) {
		await keycloak.updateToken(30).catch(() => {
			keycloak.clearToken();
		});
	}

	const headers = new Headers(init.headers || {});
	if (keycloak.token) {
		headers.set('Authorization', `Bearer ${keycloak.token}`);
	}

	return fetch(input, { ...init, headers });
}
