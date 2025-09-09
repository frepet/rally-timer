import { keycloak } from "./stores/auth";

export async function kcFetch(input: RequestInfo, init: RequestInit = {}) {
  // Ensure token is fresh (refresh if expiring in <30s)
  if (keycloak.authenticated) {
    await keycloak.updateToken(30).catch(() => keycloak.login());
  }

  const headers = new Headers(init.headers || {});
  if (keycloak.token) {
    headers.set("Authorization", `Bearer ${keycloak.token}`);
  }

  return fetch(input, { ...init, headers });
}
