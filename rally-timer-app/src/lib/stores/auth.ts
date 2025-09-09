// src/lib/stores/auth.ts
import { writable, derived } from "svelte/store";
import Keycloak from "keycloak-js";

export const keycloak = new Keycloak({
  url: "https://keycloak.peteri.se",
  realm: "platform",
  clientId: "rally-timer",
});

export const isAuthenticated = writable(false);
export const token = writable<string | null>(null);

// keep raw role buckets so you can debug easily
export const realmRoles = writable<string[]>([]);
export const clientRoles = writable<string[]>([]); // roles of THIS client

export async function initKeycloak() {
  try {
    await keycloak.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      silentCheckSsoRedirectUri: window.location.origin + "/silent-check-sso.html",
    });

    if (keycloak.authenticated) {
      isAuthenticated.set(true);
      token.set(keycloak.token ?? null);

      const rr = keycloak.realmAccess?.roles ?? [];
      const cr = keycloak.resourceAccess?.[keycloak.clientId!]?.roles ?? [];

      realmRoles.set(rr);
      clientRoles.set(cr);
    }
  } catch (e) {
    console.error("Keycloak init error", e);
  }
}

export function login() {
  keycloak.login();
}
export function logout() {
  keycloak.logout();
}

// You want the client role `admin`
export const isAdmin = derived(clientRoles, ($clientRoles) => $clientRoles.includes("admin"));
