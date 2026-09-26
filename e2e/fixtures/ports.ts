/**
 * The ports the e2e harness boots its three dev servers on. One source for
 * `playwright.config.ts` (webServer, baseURL, CORS) and for the globalSetup
 * warm-up, so moving a server cannot leave the warm-up hitting the old port.
 */
export const API_PORT = 3001;
export const CLIENT_PORT = 3000;
export const ADMIN_PORT = 3002;

export const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
export const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
