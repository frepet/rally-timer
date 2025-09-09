import Keycloak from "keycloak-js";

// configure with your realm info
export const keycloak = new Keycloak({
  url: "https://keycloak.peteri.se/",
  realm: "platform",
  clientId: "rally-timer",
});
