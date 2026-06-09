---
description: Run tests and fix failures
argument-hint: "[workspace]"
allowed-tools: Bash(npm run test:*), Read, Edit, Grep, Glob
---

Run the relevant test suite and analyze results.

1. Determine which workspace the changed files belong to (store-api, store-client, or store-admin).
2. Run `npm run test -w apps/<workspace>` — if no workspace is obvious, run `npm run test` for all.
3. If any tests fail, analyze the failures and suggest fixes.
4. After fixing, re-run tests to confirm they pass.

Use the **tdd** skill for TDD-specific workflows.

Arguments (optional workspace): $ARGUMENTS
