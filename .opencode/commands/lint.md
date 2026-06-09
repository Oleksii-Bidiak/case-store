---
description: Run ESLint and TypeScript type checking, fix all issues
agent: build
model: opencode/qwen3.6-plus
---

Run linting and type checking across the entire project. Fix all issues found.

**Steps:**

1. Run ESLint across all workspaces:

   ```bash
   npm run lint
   ```

2. Run TypeScript type checking:

   ```bash
   npm run typecheck
   ```

3. If there are lint errors:
   - Fix auto-fixable issues: `npm run lint -- --fix`
   - Manually fix remaining issues
   - Re-run to verify clean output

4. If there are type errors:
   - Fix TypeScript errors one by one
   - Re-run `npm run typecheck` to confirm

**Per-workspace commands:**

```bash
npm run lint -w apps/store-api
npm run lint -w apps/store-client
npm run lint -w apps/store-admin
```
