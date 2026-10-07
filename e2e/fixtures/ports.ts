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
  if (!raw) return fallback;
  const value = Number(raw);
  // A typo would otherwise boot `next dev -p NaN` and fail far from its cause.
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number (1–65535), got "${raw}"`);
  }
  return value;
};

export const API_PORT = port("E2E_API_PORT", 3001);
export const CLIENT_PORT = port("E2E_CLIENT_PORT", 3000);
export const ADMIN_PORT = port("E2E_ADMIN_PORT", 3002);

export const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
export const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
