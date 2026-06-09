import { defineConfig } from "orval";

export default defineConfig({
  storeAdmin: {
    input: {
      // Fetch OpenAPI spec from the running store-api backend.
      // Start store-api first, then run: npm run generate:api
      // If the backend is not running, temporarily switch to './openapi.json'
      target: "http://localhost:3001/api-json",
    },
    output: {
      mode: "tags-split",
      target: "src/shared/api/generated/endpoints.ts",
      schemas: "src/shared/api/generated/models",
      client: "react-query",
      httpClient: "axios",
      mock: false,
      clean: true,
      override: {
        mutator: {
          path: "./src/shared/api/instance.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "prettier --write",
    },
  },
});
