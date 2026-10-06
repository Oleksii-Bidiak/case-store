/**
 * The ports the e2e harness boots its three dev servers on. One source for
 * `playwright.config.ts` (webServer, baseURL, CORS) and for the globalSetup
 * warm-up, so moving a server cannot leave the warm-up hitting the old port.
 *
 * `E2E_API_PORT` / `E2E_CLIENT_PORT` / `E2E_ADMIN_PORT` move the whole stand,
 * so one worktree can run the suite while another worktree's dev servers hold
 * the defaults — `reuseExistingServer` would otherwise silently test the other
 * tree's code.
 */
const port = (name: string, fallback: number): number => {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
};

export const API_PORT = port("E2E_API_PORT", 3001);
export const CLIENT_PORT = port("E2E_CLIENT_PORT", 3000);
export const ADMIN_PORT = port("E2E_ADMIN_PORT", 3002);

export const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
export const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
