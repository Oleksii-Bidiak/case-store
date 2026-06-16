---
description: Generate Orval API hooks from OpenAPI spec
allowed-tools: Bash(npm run generate:api:*), Bash(npm run start:*), Read, Glob
---

Generate typed API hooks from the OpenAPI spec using Orval.

1. Ensure the backend server is running or that `swagger.json` exists at `apps/store-api/swagger.json`.
2. If `swagger.json` doesn't exist, generate it by starting the API server temporarily.
3. Run `npm run generate:api` (root proxy) to generate hooks for both `store-client` and `store-admin`.
4. Verify the generated files exist in `src/shared/api/generated/` for each workspace.
5. Report any errors or type mismatches.

Use the **api-contract** skill for Orval configuration details.
