"use strict";

/**
 * Shared Orval configuration factory for the monorepo frontends.
 *
 * Both `store-client` and `store-admin` generate their typed API clients from the
 * same static OpenAPI spec (`apps/store-api/swagger.json`, produced by
 * `npm run swagger:export -w apps/store-api`) using identical Orval settings. This
 * factory encodes those shared settings so the two configs cannot silently drift.
 *
 * IMPORTANT: `mutator.path`, `input.target`, and the output paths are resolved
 * relative to the **consuming app's root** (where its `orval.config.ts` lives and
 * where the `orval` CLI runs), NOT relative to this package. They are kept as
 * call-site defaults so they continue to resolve correctly after extraction.
 *
 * @param {object} config
 * @param {string} config.name Orval project key (the top-level key in the config).
 * @param {string} [config.inputTarget] OpenAPI input path. Default "../store-api/swagger.json".
 * @param {string} [config.outputDir] Generated output dir. Default "src/shared/api/generated".
 * @param {string} [config.mutatorPath] Axios mutator path. Default "./src/shared/api/instance.ts".
 * @returns {Record<string, unknown>} An object accepted by orval's `defineConfig`.
 */
function createOrvalConfig(config) {
  const {
    name,
    inputTarget = "../store-api/swagger.json",
    outputDir = "src/shared/api/generated",
    mutatorPath = "./src/shared/api/instance.ts",
  } = config;

  return {
    [name]: {
      input: {
        target: inputTarget,
      },
      output: {
        mode: "tags-split",
        target: `${outputDir}/endpoints.ts`,
        schemas: `${outputDir}/models`,
        client: "react-query",
        httpClient: "axios",
        mock: false,
        clean: true,
        override: {
          mutator: {
            path: mutatorPath,
            name: "customInstance",
          },
        },
      },
      hooks: {
        afterAllFilesWrite: "prettier --write",
      },
    },
  };
}

module.exports = { createOrvalConfig };
