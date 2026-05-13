// src/lib/stores/auth.ts
import { writable, derived } from 'svelte/store';
import Keycloak from 'keycloak-js';
import { env } from '$env/dynamic/public';

export const keycloak = new Keycloak({
	url: 'https://keycloak.peteri.se',
	realm: 'platform',
	clientId: 'rally-timer'
});

export const isAuthenticated = writable(false);
export const token = writable<string | null>(null);

// keep raw role buckets so you can debug easily
export const realmRoles = writable<string[]>([]);
export const clientRoles = writable<string[]>([]); // roles of THIS client

const KC_TOKEN_KEY = 'kc_token';
const KC_REFRESH_KEY = 'kc_refresh_token';

function updateStores() {
	isAuthenticated.set(true);
	token.set(keycloak.token ?? null);
	realmRoles.set(keycloak.realmAccess?.roles ?? []);
	clientRoles.set(keycloak.resourceAccess?.[keycloak.clientId!]?.roles ?? []);
	if (keycloak.token) localStorage.setItem(KC_TOKEN_KEY, keycloak.token);
	if (keycloak.refreshToken) localStorage.setItem(KC_REFRESH_KEY, keycloak.refreshToken);
}

function clearStorage() {
	localStorage.removeItem(KC_TOKEN_KEY);
	localStorage.removeItem(KC_REFRESH_KEY);
}

export async function initKeycloak() {
	if (env.PUBLIC_SKIP_AUTH === 'true') {
		isAuthenticated.set(true);
		clientRoles.set(['admin']);
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
				updateStores();
			} catch {
				// Refresh token expired or revoked
				clearStorage();
			}
		} else {
			// No stored tokens — initialise without redirect; user can click Login.
			// init() still processes an auth code in the URL if returning from a login redirect.
			await keycloak.init({ pkceMethod: 'S256' });
			if (keycloak.authenticated) {
				updateStores();
			}
		}

		keycloak.onTokenExpired = async () => {
			try {
				await keycloak.updateToken(30);
				updateStores();
			} catch {
				clearStorage();
				isAuthenticated.set(false);
				token.set(null);
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

// You want the client role `admin`
export const isAdmin = derived(clientRoles, ($clientRoles) => $clientRoles.includes('admin'));
