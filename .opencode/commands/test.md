---
description: Run the full test suite with coverage report and fix failures
agent: build
model: opencode-go/glm-5.1
---

Run the full test suite with coverage report and analyze any failures.

**Steps:**

1. Determine which workspace the changed files belong to:
   - `apps/store-api` — backend tests (Jest + Supertest)
   - `apps/store-client` — frontend tests (Jest + React Testing Library)
   - `apps/store-admin` — admin panel tests

2. Run the appropriate test command:
   - All workspaces: `npm run test`
   - Specific workspace: `npm run test -w apps/<workspace>`

3. If any tests fail:
   - Analyze the failure messages
   - Fix the root cause
   - Re-run tests to confirm they pass

4. For critical modules (cart, discounts, inventory, auth), use the @tdd skill.

**Commands:**
```
npm run test           # All tests
npm run test -w apps/store-api     # Backend only
npm run test -w apps/store-client   # Client only
npm run test:e2e       # E2E tests (backend)
```