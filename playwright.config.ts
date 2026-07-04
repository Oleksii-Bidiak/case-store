import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (TASK-105-D). Scaffolds the full-stack smoke suite:
 * boots the API (3001) and storefront (3000) via `webServer`, then drives
 * Chromium against the storefront. A seeded test DB is required — see
 * `e2e/fixtures/seed-e2e.ts` (run as `globalSetup`).
 *
 * Local run:
 *   1. Start Postgres (docker compose) and set DATABASE_URL.
 *   2. `npx prisma migrate deploy --schema=apps/store-api/prisma/schema.prisma`
 *   3. `npm run test:e2e:pw`
 *
 * CI runs this as a non-blocking job until the harness is proven stable.
 */
const API_PORT = 3001;
const CLIENT_PORT = 3000;
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

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Boot the API and storefront before the suite. `reuseExistingServer` lets a
  // developer keep their own dev servers running locally.
  webServer: [
    {
      command: "npm run start:dev -w apps/store-api",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DATABASE_URL, NODE_ENV: "test" },
    },
    {
      command: "npm run dev -w apps/store-client",
      port: CLIENT_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
