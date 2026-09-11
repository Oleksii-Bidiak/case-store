import * as path from "node:path";

/**
 * Where the admin projects keep their signed-in browser state (TASK-405).
 *
 * The admin session is entirely cookie-based — an HttpOnly refresh cookie set by
 * store-api plus the non-secret `admin_ui_session` marker the app writes for its
 * edge proxy — so a saved `storageState` is enough to bootstrap it: the access
 * token itself lives in memory and is re-minted from the refresh cookie on load.
 *
 * Written by `e2e/admin.setup.ts`, consumed by every `admin-*.spec.ts`.
 * Gitignored: it is a live session for the seeded staff account.
 */
export const ADMIN_STORAGE_STATE = path.resolve(
  __dirname,
  "../.auth/admin.json",
);
