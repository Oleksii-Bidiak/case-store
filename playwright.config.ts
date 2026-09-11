import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (TASK-105-D). Scaffolds the full-stack smoke suite:
 * boots the API (3001), the storefront (3000) and the admin panel (3002) via
 * `webServer`, then drives Chromium against them. A seeded test DB is required —
 * see `e2e/fixtures/seed-e2e.ts` (run as `globalSetup`).
 *
 * Two surfaces, two projects, because they have different origins and different
 * session requirements (TASK-405):
 *   - `chromium` — the storefront on 3000, anonymous by default.
 *   - `admin`    — the admin panel on 3002, each spec signing in for itself via
 *                  `loginAsAdmin` (see e2e/fixtures/admin-session.ts for why a
 *                  shared storageState cannot work here).
 *
 * Local run:
 *   1. Start Postgres (docker compose) and set DATABASE_URL.
 *   2. `npx prisma migrate deploy --config apps/store-api/prisma.config.ts`
 *   3. `npm run test:e2e:pw`
 *
 * CI runs this as a non-blocking job until the harness is proven stable.
 */
const API_PORT = 3001;
const CLIENT_PORT = 3000;
const ADMIN_PORT = 3002;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/store_test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Serial locally: parallel workers stampede the dev server's on-demand
  // compilation (page.goto times out cold) and share one Redis rate-limit
  // counter on auth endpoints (spurious 429s). CI builds decide themselves.
  workers: process.env.CI ? undefined : 1,
  // Dev-mode compiles can push a first navigation past the 30s default.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/fixtures/seed-e2e.ts",

  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Storefront project: everything except the admin suite, which needs the
      // other origin and a staff session.
      testIgnore: ["admin-*.spec.ts"],
    },
    {
      // No `dependencies` / `storageState` setup project: the refresh cookie
      // this API issues is single-use (rotation + reuse detection), so a saved
      // session file is spent by the first context that opens it. Each admin
      // spec signs in for itself — `loginAsAdmin`, and the long comment on it.
      name: "admin",
      testMatch: "admin-*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${ADMIN_PORT}`,
      },
    },
  ],

  // Boot the API, storefront and admin panel before the suite.
  // `reuseExistingServer` lets a developer keep their own dev servers running
  // locally.
  webServer: [
    {
      command: "npm run start:dev -w apps/store-api",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL,
        NODE_ENV: "test",
        // The API defaults to allowing localhost:3000 alone, so without this the
        // admin panel's every XHR dies in CORS preflight and the admin specs
        // fail with an empty table rather than a useful error.
        CORS_ORIGINS: `http://localhost:${CLIENT_PORT},http://localhost:${ADMIN_PORT}`,
      },
    },
    {
      command: "npm run dev -w apps/store-client",
      port: CLIENT_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
    },
    {
      command: "npm run dev -w apps/store-admin",
      port: ADMIN_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
