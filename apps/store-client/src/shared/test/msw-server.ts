import { setupServer } from "msw/node";
import { handlers } from "./msw-handlers";

/**
 * Shared MSW server for component tests (node mode). Intercepts the real HTTP
 * requests made by the Orval-generated hooks (via the axios `customInstance`),
 * so tests exercise the actual hooks rather than re-mocking them.
 *
 * Lifecycle (listen / resetHandlers / close) is wired in `setup.ts`. Individual
 * tests override behaviour per-case with `server.use(...)`.
 */
export const server = setupServer(...handlers);
