# Plan 044 — Add `npm run build` Step to CI

> **Status:** To Do
> **Phase:** Phase A — Stabilize & Close Out (infrastructure sub-track)
> **Parent Task:** TASK-100
> **Created:** 2026-06-21
> **Last Updated:** 2026-06-21

---

## Overview

The CI pipeline (`.github/workflows/ci.yml`) currently runs typecheck, lint, unit tests,
e2e tests, and integration tests — but it does NOT run `npm run build`. This gap means
two classes of breakage can merge undetected:

1. **Orval drift** — a developer changes an API endpoint (controller signature, DTO,
   `@ApiProperty` decorator) and forgets to run `npm run generate:api`. The Orval-generated
   types in `**/shared/api/generated/` become stale. `tsc --noEmit` may still pass (the
   generated files are type-correct as-of their last generation), but `next build` would
   expose mismatches the moment real pages exercise the diverged hooks.

2. **Next.js build failures** — dynamic import errors, missing `remotePatterns`, invalid
   `<Image>` props, RSC/client-component boundary violations, and similar issues that only
   surface during the full `next build` compilation but are invisible to `tsc --noEmit`.

For `store-api` the risk is a bit different: `nest build` (which compiles via webpack and
`tsc`) can catch decorator-metadata or module-wiring errors that the plain typecheck misses
when `emitDecoratorMetadata` is in play.

Adding a `build` job to CI closes all of these gaps and makes the pipeline a complete
pre-merge safety net.

---

## User Stories

1. As a developer, I want the CI pipeline to fail fast when a `next build` breaks so that
   I catch the issue before it reaches `develop` or `main`.
2. As a developer, I want CI to catch stale Orval-generated files so that I am reminded to
   run `npm run generate:api` before raising a PR.
3. As a team, we want `develop` and `main` to always be in a buildable state so that any
   commit can be deployed or demoed without a local build-fix step.

---

## Scope

### In Scope

- Add a new `build` job to `.github/workflows/ci.yml` that runs `npm run build` across all
  three workspaces (`store-api`, `store-client`, `store-admin`).
- Supply the minimum required environment variables for `next build` to succeed
  (`NEXT_PUBLIC_*` placeholders — the builds only need the variables to be _defined_, not
  real values; Next.js inlines them at build time and the CI build is not served to users).
- Position the job in the dependency graph so it runs in parallel with unit tests (both
  depend on typecheck + lint, not on each other).
- Document the `NEXT_PUBLIC_*` CI secret/variable strategy so future developers understand
  why placeholder values are used.

### Out of Scope

- Caching the `.next` build output or `dist/` between CI runs (a future optimization, not
  needed for correctness).
- Splitting the `build` job into per-workspace jobs (single job is simpler and sufficient
  for the current repo size; revisit if build times exceed ~8 min).
- Generating the Orval API client inside CI (Orval requires a running `store-api` server
  to fetch the OpenAPI spec; enforcing up-to-date generated files is a separate task
  involving snapshot-testing the spec or serving a mock).
- Any changes to application code, Prisma schema, or frontend components.

---

## Technical Design

### How `npm run build` works in this monorepo

The root `package.json` defines:

```json
"build": "npm run build -w apps/store-api -w apps/store-client -w apps/store-admin"
```

This runs the workspaces sequentially in the listed order:

| Workspace           | Command      | Tool                       | Key requirement                                                                                                          |
| ------------------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/store-api`    | `nest build` | NestJS CLI + tsc + webpack | No env vars required; `tsconfig.build.json` used                                                                         |
| `apps/store-client` | `next build` | Next.js 16                 | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CURRENCY` read from env at build time |
| `apps/store-admin`  | `next build` | Next.js 16                 | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL` read from env at build time                        |

### Environment variables at CI build time

Both Next.js apps read `process.env.NEXT_PUBLIC_*` inside `next.config.ts` and embed them
as static string substitutions in the bundle. If a variable is `undefined` at build time,
Next.js substitutes the literal string `"undefined"` — which will cause runtime errors
**when the app is served**, but will not cause the build itself to fail.

For CI the goal is to verify that the **build compilation succeeds**, not to produce a
production artifact. Therefore providing placeholder string values (e.g.
`http://localhost:3001`) is safe and correct. These are not secrets — they are just
enough for Next.js to proceed with compilation.

The variables are added as `env:` entries directly on the `build` job step (not as GitHub
Actions Secrets), keeping the CI file self-documenting and avoiding the overhead of
configuring repository-level secrets for non-sensitive placeholder data.

```yaml
env:
  NEXT_PUBLIC_API_URL: http://localhost:3001
  NEXT_PUBLIC_APP_URL: http://localhost:3000
  NEXT_PUBLIC_SITE_URL: http://localhost:3000
  NEXT_PUBLIC_CURRENCY: UAH
  NEXT_PUBLIC_ADMIN_URL: http://localhost:3002
```

### Job dependency graph (after the change)

```
typecheck ─┬──────────────────────────────────┐
           │                                   │
lint ──────┤── test-unit ─── test-e2e          │
           │            └─── test-int          │
           │                                   │
           └── build  ◄─────────────────────── ┘
                (new — parallel with test-unit)
```

`build` depends on `typecheck` and `lint` (same as `test-unit`) and runs in parallel with
`test-unit`. It does NOT depend on `test-unit` because a build failure should be visible
immediately alongside test failures, not hidden behind a test bottleneck.

### Prisma client in CI

`store-api`'s `nest build` triggers TypeScript compilation of `src/`, which imports from
`@prisma/client`. The Prisma client is generated from the schema at `prisma generate` time.
In CI the existing `test-e2e` and `test-int` jobs already run `npx prisma generate` before
their steps — but the new `build` job is isolated and needs its own generate step.

Without `prisma generate`, `nest build` will fail with:

```
Cannot find module '.prisma/client' or its corresponding type declarations
```

Therefore the `build` job must run `npx prisma generate` before `npm run build`.

---

## Tasks

### TASK-100: Add `npm run build` step to CI

**Type:** chore
**Scope:** store-api, store-client, store-admin (CI pipeline only)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** — (standalone, no application code changes)

**Problem Statement:**

The current `.github/workflows/ci.yml` has five jobs: `typecheck`, `lint`, `test-unit`,
`test-e2e`, `test-int`. None of them execute a full production build. A developer can
merge a PR where `next build` fails (due to bad RSC boundary, missing `remotePatterns`,
stale Orval types, etc.) and the CI pipeline will still be green.

**Implementation Steps:**

1. Add a `build` job to `.github/workflows/ci.yml` with `needs: [typecheck, lint]`.
2. Copy the standard step preamble from any existing job:
   `actions/checkout@v4` + `actions/setup-node@v4 (node 20, cache: npm)` + `npm ci`.
3. Add `npx prisma generate --schema=apps/store-api/prisma/schema.prisma` before the
   build command (required for `nest build` to find `@prisma/client` types).
4. Add `run: npm run build` with the `NEXT_PUBLIC_*` env vars as an `env:` block on that
   step (see Technical Design section above).
5. Verify the YAML is valid and the job name is human-readable (`name: Build`).

**Acceptance Criteria:**

- [ ] A `build` job exists in `.github/workflows/ci.yml`
- [ ] The job has `needs: [typecheck, lint]` — it starts once both static-analysis jobs
      pass, in parallel with `test-unit`
- [ ] The job runs on `ubuntu-latest` (consistent with all other jobs)
- [ ] Steps in order: `checkout` → `setup-node (20, cache:npm)` → `npm ci` →
      `prisma generate` → `npm run build`
- [ ] The `npm run build` step has an `env:` block supplying all five `NEXT_PUBLIC_*`
      variables as non-empty placeholder strings (`http://localhost:3001` etc.)
- [ ] The job does NOT require a live PostgreSQL service (the NestJS build is a
      compilation step only — no database connection is made at build time)
- [ ] Local verification: `npm run build` succeeds in the dev environment before the
      YAML change is committed (pre-flight check)
- [ ] After pushing the branch and opening a PR against `develop`, the GitHub Actions UI
      shows the `Build` job green alongside `Type Check` and `Lint`
- [ ] No changes to application source code, Prisma schema, or generated API files

**Files to create/modify:**

- `.github/workflows/ci.yml` — add `build` job (see exact YAML below)

**Exact YAML to add** (insert after the `lint` job block, before `test-unit`):

```yaml
build:
  name: Build
  runs-on: ubuntu-latest
  needs: [typecheck, lint]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npx prisma generate --schema=apps/store-api/prisma/schema.prisma
    - run: npm run build
      env:
        NEXT_PUBLIC_API_URL: http://localhost:3001
        NEXT_PUBLIC_APP_URL: http://localhost:3000
        NEXT_PUBLIC_SITE_URL: http://localhost:3000
        NEXT_PUBLIC_CURRENCY: UAH
        NEXT_PUBLIC_ADMIN_URL: http://localhost:3002
```

---

## Migration Steps

1. Run `npm run build` locally to confirm the current codebase builds cleanly before
   touching CI. Fix any pre-existing build errors first (the CI change should not be the
   first time a build failure is discovered).
2. Open `.github/workflows/ci.yml`.
3. Insert the `build` job YAML block from the Acceptance Criteria section.
4. Validate the YAML syntax locally:
   `npx js-yaml .github/workflows/ci.yml` (or use a VS Code YAML extension).
5. Commit on `develop` (this is a CI config change with no risk of breaking application
   code — working directly on `develop` is acceptable per project conventions):
   `chore(ci): add build job to catch Next.js and NestJS compilation failures`
6. Push and confirm the new `Build` check appears green in the GitHub Actions UI.
7. Mark TASK-100 as ✅ in `BACKLOG.md`.

---

## Verification Steps

| Step                  | Command                                                                        | Expected result                                                         |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1. Local pre-flight   | `npm run build` (from repo root)                                               | All three workspaces build without error                                |
| 2. API build alone    | `npm run build -w apps/store-api`                                              | `nest build` exits 0; `dist/` created                                   |
| 3. Client build alone | `NEXT_PUBLIC_API_URL=http://localhost:3001 npm run build -w apps/store-client` | `next build` exits 0                                                    |
| 4. Admin build alone  | `NEXT_PUBLIC_API_URL=http://localhost:3001 npm run build -w apps/store-admin`  | `next build` exits 0                                                    |
| 5. YAML lint          | `npx js-yaml .github/workflows/ci.yml`                                         | No parse errors                                                         |
| 6. Push / open PR     | Push `develop` to remote                                                       | GitHub Actions shows `Build` job green                                  |
| 7. Orval drift check  | Delete a line from a generated file in `shared/api/generated/`, push           | `Build` job should fail (TypeScript error surfaces during `next build`) |

Step 7 is optional but recommended as a one-time validation that the gate actually catches
Orval drift.

---

## Risks and Mitigations

| Risk                                                                                                                                  | Likelihood                               | Mitigation                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `nest build` fails in CI because `@prisma/client` types not generated                                                                 | High (if `prisma generate` step omitted) | Include `prisma generate` step before `npm run build` — already specified in the implementation steps above                              |
| `next build` fails because `NEXT_PUBLIC_*` vars are undefined                                                                         | Medium (if `env:` block omitted)         | Supply placeholder string values in the job `env:` block; document that they are CI-only build-time placeholders                         |
| Build time pushes CI duration beyond acceptable limits                                                                                | Low (expected ~3-5 min total)            | If build exceeds ~8 min, split into per-workspace parallel jobs in a follow-up                                                           |
| `store-admin` `test` script (`echo 'No tests yet' && exit 0`) causes the root `npm run test` to succeed while admin has no real tests | Not a risk for this task                 | Out of scope; tracked separately as part of TASK-105                                                                                     |
| A future developer adds a real env var (e.g. an API key) that `next build` requires; the placeholder breaks                           | Low                                      | When new required build-time vars are added, update the `env:` block in the `build` job; document the policy in the CI file as a comment |

---

## Notes

- **Why `needs: [typecheck, lint]` and not `needs: [test-unit]`?** Making `build` depend
  on `test-unit` would serialize them and add unnecessary latency. A build failure should
  be surfaced as quickly as a test failure — both are equally important gates. Parallel
  execution keeps CI feedback fast.

- **Why placeholder env vars directly in the YAML, not GitHub Secrets?** The `NEXT_PUBLIC_*`
  values needed for a compilation check are not secret (they are embedded in the JS
  bundle). Using repository secrets for non-sensitive placeholder data adds operational
  overhead with no security benefit. If real production values are ever needed in CI
  (e.g., for a staging deploy step), migrate them to secrets at that point.

- **Orval-generated files.** The generated files in `**/shared/api/generated/` are
  committed to the repo (pre-commit hooks block editing them, but they are tracked by git).
  If they are stale, `next build` will surface TypeScript errors where the generated hook
  types no longer match what the component expects. This is the intended behavior — the
  build job acts as the enforcement point.

- **Branch for this change.** Per project conventions, CI config changes with no
  application risk may be committed directly on `develop`. However, if the team prefers
  a feature branch, use `chore/100-ci-build-step`.

- **Follow-up optimization (not in scope).** Once the build job is green and stable,
  consider adding npm/Next.js build caching between runs (actions/cache for `.next/cache`
  and `dist/`). This can cut build job time by 40-60% on cache hits.
