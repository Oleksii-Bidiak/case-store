import type { defineConfig } from "orval";

/**
 * The object shape accepted by orval's `defineConfig` (its internal `ConfigExternal`).
 * Derived from `defineConfig` because orval does not name-export the type directly.
 */
type OrvalConfig = Parameters<typeof defineConfig>[0];

export interface OrvalAppConfig {
  /** The Orval project key — becomes the top-level key in the config object. */
  name: string;
  /**
   * Path to the OpenAPI input file, relative to the consuming workspace root.
   * @default "../store-api/swagger.json"
   */
  inputTarget?: string;
  /**
   * Directory for generated output files, relative to the consuming workspace root.
   * @default "src/shared/api/generated"
   */
  outputDir?: string;
  /**
   * Axios mutator path, resolved relative to the consuming app root (NOT this package).
   * @default "./src/shared/api/instance.ts"
   */
  mutatorPath?: string;
}

/**
 * Build the shared Orval config for a frontend app. Encodes every setting shared
 * between `store-client` and `store-admin`; callers supply only what differs (`name`).
 */
export declare function createOrvalConfig(config: OrvalAppConfig): OrvalConfig;
