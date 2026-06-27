import Keycloak from 'keycloak-js';
import { env } from '$env/dynamic/public';

export const keycloak = new Keycloak({
	url: env.PUBLIC_KEYCLOAK_URL || 'https://keycloak.peteri.se',
	realm: env.PUBLIC_KEYCLOAK_REALM || 'platform',
	clientId: 'rally-timer'
});

class AuthState {
	isAuthenticated = $state(false);
	token = $state<string | null>(null);
	// keep raw role buckets so you can debug easily
	realmRoles = $state<string[]>([]);
	clientRoles = $state<string[]>([]); // roles of THIS client
	readonly isAdmin = $derived(this.clientRoles.includes('admin'));
}

export const auth = new AuthState();

const KC_TOKEN_KEY = 'kc_token';
const KC_REFRESH_KEY = 'kc_refresh_token';

function updateAuth() {
	auth.isAuthenticated = true;
	auth.token = keycloak.token ?? null;
	auth.realmRoles = keycloak.realmAccess?.roles ?? [];
	auth.clientRoles = keycloak.resourceAccess?.[keycloak.clientId!]?.roles ?? [];
	if (keycloak.token) localStorage.setItem(KC_TOKEN_KEY, keycloak.token);
	if (keycloak.refreshToken) localStorage.setItem(KC_REFRESH_KEY, keycloak.refreshToken);
}

function clearStorage() {
	localStorage.removeItem(KC_TOKEN_KEY);
	localStorage.removeItem(KC_REFRESH_KEY);
}

export async function initKeycloak() {
	if (env.PUBLIC_SKIP_AUTH === 'true') {
		auth.isAuthenticated = true;
		auth.clientRoles = ['admin'];
		return;
	}
	try {
		const storedToken = localStorage.getItem(KC_TOKEN_KEY) ?? undefined;
		const storedRefreshToken = localStorage.getItem(KC_REFRESH_KEY) ?? undefined;

		if (storedToken && storedRefreshToken) {
			// Restore session from stored tokens — keycloak treats this as authenticated
			await keycloak.init({
				pkceMethod: 'S256',
				token: storedToken,
				refreshToken: storedRefreshToken
			});
			try {
				// Force a refresh so we have a valid (non-expired) access token
				await keycloak.updateToken(-1);
				updateAuth();
			} catch {
				// Refresh token expired or revoked — reset adapter state so
				// kcFetch won't see authenticated=true with an unusable token
				clearStorage();
				keycloak.clearToken();
			}
		} else {
			// No stored tokens — initialise without redirect; user can click Login.
			// init() still processes an auth code in the URL if returning from a login redirect.
			await keycloak.init({ pkceMethod: 'S256' });
			if (keycloak.authenticated) {
				updateAuth();
			}
		}

		keycloak.onTokenExpired = async () => {
			try {
				await keycloak.updateToken(30);
				updateAuth();
			} catch {
				clearStorage();
				auth.isAuthenticated = false;
				auth.token = null;
			}
		};
	} catch (e) {
		console.error('Keycloak init error', e);
	}
}

export function login() {
	keycloak.login();
}
export function logout() {
	clearStorage();
	keycloak.logout();
}
