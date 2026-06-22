import { setupServer } from "msw/node";
import { handlers } from "./msw-handlers";

/**
 * Shared MSW server for store-admin component tests (node mode). Intercepts the
 * HTTP requests made by Orval-generated hooks at the network layer. Lifecycle is
 * wired in `setup.ts`; override per-test with `server.use(...)`.
 */
export const server = setupServer(...handlers);
