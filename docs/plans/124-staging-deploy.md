# Plan 124 — Staging Deploy (GitHub Actions → GHCR → VPS)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 2** (Деплой (staging рано) + аналітика паралельно)
> **Origin:** `docs/handoff-2026-07-07.md` Блок H «CI/CD: тест-сервер замовника + прод», lines
> 311–355 (TASK-271 detail lines 333–343)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-271
> **Depends on:** TASK-270 / plan 123 (this plan builds and deploys exactly the three images that
> plan defines)

## Overview

TASK-270 (plan 123) produces three deployable images and a compose file that boots them together
— but nothing yet _runs_ that on a server. This plan is the pipeline: on every green push to
`develop`, build the three images, push them to a container registry, SSH into the owner's staging
VPS, pull and restart, apply the current schema, and smoke-check. The owner explicitly wants
staging stood up **early** in this wave (Хвиля 2's own title: "Деплой (staging рано)") specifically
so they can start reviewing real deployments of upcoming work as soon as it lands on `develop`,
well before production (TASK-272, a later wave gated behind "обкатки на staging").

**This iteration's scope is deliberately narrower than a full first deploy.** Per an explicit,
locked owner decision: this plan authors the pipeline and the operator runbook, and verifies what
can be verified without a server that doesn't exist yet — workflow YAML validity and that the
images it would push are the same ones that build locally (already proven by plan 123). **The
first real deploy to a real VPS is the owner's own step**, once they've provisioned the server,
pointed DNS at it, and populated the `staging` GitHub Environment's secrets — and is explicitly
routed to `docs/manual-qa-pending.md`, not treated as a blocker for this plan.

**Staging's schema strategy is `prisma db push`, not `prisma migrate deploy`** — a second locked
owner decision, and, independent of the owner's preference, presently the _only_ correct option:
this repo's `.gitignore` excludes essentially all Prisma migration folders
(`apps/store-api/prisma/migrations/*_*/`), and `git ls-files` confirms only **one** migration is
currently version-controlled (`20260625210000_variant_as_product_position` — a small incremental
diff, not a full-schema snapshot). `schema.prisma` is this team's actual source of truth (already
documented in `docs/manual-qa-pending.md` §9: "схему вже запушено... через `prisma db push`
(міграція `migrate dev` не пройшла через дрейф Етапу 2 — це очікувано, `schema.prisma` є джерелом
правди)"). Running `migrate deploy` against a fresh staging database today would apply exactly one
incremental diff to an otherwise-empty schema and fail immediately. A clean, squashed baseline
migration that makes `migrate deploy` viable again is explicitly **deferred to TASK-272**
(production) — staging, being disposable and rebuildable, does not need to wait for that.

## Scope

### In Scope

- A new job (or a small dedicated workflow) that builds and pushes the three `docker build`
  targets plan 123 defines to GHCR, triggered on push to `develop` after the existing CI jobs pass.
- SSH-based deploy step: `docker compose -f docker-compose.prod.yml pull && up -d` on the staging
  host, followed by `prisma db push --accept-data-loss` run inside the already-running `store-api`
  container, followed by a health-check smoke pass against all three apps.
- Concurrency control (one staging deploy at a time), GitHub Environment-scoped secrets
  (`staging`), and a rollback mechanism (redeploy a previous image tag).
- `docs/deploy.md` — a plain-language (UA) operator runbook: how to watch a deploy, read logs,
  restart a service, and roll back.

### Out of Scope

- Anything TASK-270/plan 123 owns (Dockerfiles, `docker-compose.prod.yml`, `Caddyfile`,
  `.env.production.example`) — this plan only **consumes** those artifacts, never edits them.
- Production deploy (TASK-272) — separate future plan; different trigger (`push` to `main`),
  different Environment (`production`, with a required-reviewer manual-approval gate this plan's
  `staging` Environment does not need), a pre-migration `pg_dump` backup step, and — critically —
  the squashed-baseline migration + switch to `migrate deploy` this plan explicitly does not do.
- Provisioning the actual staging VPS, DNS, or populating real secret values — the owner's own
  step once infrastructure exists (see Overview).
- A Telegram (or similar) deploy-result notification — noted as an optional future nicety, not a
  blocking acceptance criterion; GitHub's own commit-status/checks UI already satisfies "мінімум —
  статус у GitHub."
- Meilisearch reindex, `pg_dump` nightly backups, and on-demand storefront revalidation
  post-deploy — all explicitly TASK-272 (production) concerns per the handoff; staging's disposable
  data does not warrant them.

## User Stories

1. As the store owner, I want every change merged to `develop` to automatically appear on a test
   server I can click through, so I can review upcoming work before it ever reaches customers,
   without asking a developer to deploy it for me.
2. As the developer, I want a single command's worth of visibility (`docs/deploy.md`) into how to
   check what's running, read logs, and undo a bad deploy, so an incident doesn't require
   re-deriving the pipeline's internals under pressure.
3. As the store owner, I want deploys to queue rather than collide if two changes land close
   together, so a half-finished deploy never gets stomped by a second one mid-flight.

## Technical Design

### Design Decision 1 — extend the existing `ci.yml`, not a separate workflow

The new job lives in `.github/workflows/ci.yml` itself (not a new file triggered via
`workflow_run`), as a `deploy-staging` job with:

```yaml
needs: [build, test-unit, test-e2e, test-int]
if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
environment:
  name: staging
concurrency:
  group: deploy-staging
  cancel-in-progress: false
permissions:
  contents: read
  packages: write
```

This directly implements "push у develop (після зеленого CI)" — GitHub Actions' own `needs:` graph
_is_ the "after green CI" gate, with no extra polling/webhook plumbing needed. `test-e2e-playwright`
is deliberately **not** in `needs:` — it already runs `continue-on-error: true` in the existing
workflow ("non-blocking while the harness is being stabilized"), so gating a deploy on it would
reintroduce exactly the flakiness that flag was added to avoid. `concurrency.cancel-in-progress:
false` **queues** a second push rather than killing an in-flight deploy — cancelling mid-`docker
compose up` risks leaving the staging stack in a half-restarted state, which queuing avoids.
`environment: staging` scopes this job's secrets (Design Decision 3) and gives the owner a
dedicated "staging deployments" history in GitHub's UI, with **no** required-reviewer protection
rule (that gate is production-only, TASK-272) — staging auto-deploys on every green `develop` push
by design.

### Design Decision 2 — build/tag/push (GHCR)

- `docker/login-action@v3` against `ghcr.io` using `${{ github.actor }}` /
  `${{ secrets.GITHUB_TOKEN }}` (no extra PAT needed — the built-in token is sufficient for a
  same-repo GHCR push once `permissions.packages: write` is set).
- **GHCR requires a lowercase image path** — `${{ github.repository_owner }}` renders as
  `Oleksii-Bidiak` (mixed case) and must be lowercased (`${{ github.repository_owner_id }}`
  isn't a name; use `${{ github.actor }}` lowercased via a small shell step, or hardcode the
  lowercase owner — a small, easy-to-miss gotcha called out explicitly as a Risk).
- Three `docker/build-push-action@v6` invocations (one per plan 123 Dockerfile), each:
  - `context: .` (repo root — required per plan 123's Design Decision 1)
  - `file: apps/<app>/Dockerfile`
  - `build-args:` — for the two Next apps, the full `NEXT_PUBLIC_*` set from plan 123's Design
    Decision 3, but populated with **staging's own** domain values (from this job's `staging`
    Environment variables/secrets) — see the baked-build-arg consequence below.
  - `tags:` two tags per image — `ghcr.io/<owner>/store-<app>:staging-${{ github.sha }}` (immutable,
    used for rollback) **and** `ghcr.io/<owner>/store-<app>:staging-latest` (floating, what the
    deploy step actually pulls by default).
  - `push: true`.
- **Direct consequence of plan 123's "baked `NEXT_PUBLIC_API_URL`" risk:** because the two Next
  images are tied to the domain baked in at build time, this job's staging build **cannot** be the
  same artifact a later production pipeline (TASK-272) would promote — production needs its own
  build with its own domain's build-args. This plan's images are staging-only from the moment
  they're built; there is no "build once, promote to prod" step anywhere in this repo's pipeline,
  by design, for as long as `NEXT_PUBLIC_API_URL` stays a build-time value.

### Design Decision 3 — secrets and the remote `.env.production`

Per the handoff verbatim ("Secrets у GitHub Environments (`staging`): SSH-ключ, hostname,
env-файл"), the `staging` GitHub Environment holds exactly four secrets: `SSH_HOST`, `SSH_USER`,
`SSH_PRIVATE_KEY`, and `STAGING_ENV_FILE` (the **entire contents** of a filled-in
`.env.production` file as one multi-line secret, rather than 30-odd individual GitHub secrets one
per var — dramatically simpler to keep in sync with plan 123's `.env.production.example` as that
file evolves). The deploy step writes `STAGING_ENV_FILE` to `.env.production` on the remote host
before `docker compose` reads it.

### Design Decision 4 — the deploy step itself

Via an SSH action (e.g. `appleboy/ssh-action`) or a plain `ssh`/`heredoc` step against
`SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`, on the remote host (assumed working directory
`/opt/store-ai`, containing a checkout of this repo — or at minimum
`docker-compose.prod.yml`/`Caddyfile`, whichever the implementer finds simpler to keep in sync;
**left as an implementation-time decision**, noted in Notes):

1. Write the `STAGING_ENV_FILE` secret to `.env.production`.
2. `IMAGE_TAG=staging-${{ github.sha }} docker compose -f docker-compose.prod.yml pull`
3. `IMAGE_TAG=staging-${{ github.sha }} docker compose -f docker-compose.prod.yml up -d`
   — this requires `docker-compose.prod.yml`'s three app-service `image:`/`build:` blocks to
   reference `${IMAGE_TAG:-staging-latest}` in their tag (a detail plan 123 should already
   accommodate, since a floating-only tag scheme would make step 6's rollback impossible — flagged
   as a **cross-plan dependency note**, see Dependencies & Sequencing).
4. `docker compose -f docker-compose.prod.yml exec -T store-api npx prisma db push
--schema=prisma/schema.prisma --accept-data-loss` — the owner-decided staging schema strategy
   (Overview); `--accept-data-loss` is Prisma's required flag for `db push` whenever the computed
   diff could be destructive, appropriate here since staging data is explicitly disposable/
   rebuildable, and explicitly **not** to be copied into any future production pipeline.
5. Smoke: `curl -f https://api.<staging-domain>/health`, `curl -f https://<staging-domain>/`,
   `curl -f https://admin.<staging-domain>/`, each with a short retry/backoff loop (containers can
   take a few seconds to become ready after `up -d`) — job fails loudly if any of the three don't
   return 2xx within the retry window.
6. **Rollback** (manual operator action, documented in `docs/deploy.md`, not an automated step in
   this job): re-run steps 2–3 with `IMAGE_TAG` set to the _previous_ known-good
   `staging-<sha>` tag (visible in the GHCR package history / the previous successful workflow
   run's logs) — no image rebuild needed since the previous tag already exists in the registry.

### Design Decision 5 — `docs/deploy.md`

Plain-UA operator runbook, matching the register already used in `docs/manual-qa-pending.md` and
`docs/admin-guide.md` (written for a non-technical owner, concrete commands, no jargon left
unexplained):

- **Що відбувається автоматично** — every push to `develop` (once CI is green) redeploys staging
  within a few minutes; production is untouched until TASK-272 exists.
- **Як подивитись логи** — `ssh <user>@<host>`, then
  `docker compose -f docker-compose.prod.yml logs -f <service>`.
  ​
- **Як перезапустити один сервіс** — `docker compose -f docker-compose.prod.yml restart <service>`.
- **Як відкотитись** — the exact `IMAGE_TAG=staging-<previous-sha>` procedure from Design
  Decision 4, plus where to find the previous sha (GitHub Actions run history, or `git log
--oneline develop`).
- **Де дивитись, чи деплой пройшов** — the GitHub Actions tab, the `staging` Environment's
  deployment history, and the three-app smoke-check step's own output.

## API Contract

No changes. This plan adds no endpoint, DTO, or schema field — it is purely CI/CD plumbing around
the already-existing API surface. **No Orval regen.**

## Tasks

### TASK-271-A: `deploy-staging` job in `ci.yml` — build, tag, push to GHCR

**Type:** feat
**Scope:** shared (`.github/workflows/ci.yml`)
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-270 (plan 123) — needs the three Dockerfiles + `docker-compose.prod.yml` to
exist and build cleanly

**Acceptance Criteria:**

- [ ] `ci.yml` gains the `deploy-staging` job exactly per Design Decisions 1–2 (`needs`/`if`/
      `environment`/`concurrency`/`permissions` block, three `docker/build-push-action` steps,
      lowercase-owner image path, two tags per image)
- [ ] Build-args for `store-client`/`store-admin` are sourced from `staging` Environment
      secrets/variables, not hardcoded
- [ ] Local-verifiable: the modified `ci.yml` parses as valid YAML (`python -c "import yaml;
  yaml.safe_load(open('.github/workflows/ci.yml'))"` or equivalent) and, if `actionlint` is
      available in the dev environment, passes it with no new findings
- [ ] Local-verifiable: each of the three `docker build` commands the new job would run (same
      `context`/`file`/`build-args` shape) succeeds locally, reusing plan 123's already-verified
      Dockerfiles — confirms this job builds the same artifacts, not a divergent copy
- [ ] No existing `ci.yml` job (`typecheck`/`lint`/`build`/`test-unit`/`test-e2e`/
      `test-e2e-playwright`/`test-int`) is modified beyond what's needed to add `deploy-staging`'s
      `needs:` references

**Files to create/modify:**

- `.github/workflows/ci.yml`

---

### TASK-271-B: SSH deploy step — pull/up/db-push/smoke

**Type:** feat
**Scope:** shared
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-271-A

**Acceptance Criteria:**

- [ ] The `deploy-staging` job gains the SSH-based remote steps exactly per Design Decision 4
      (write `.env.production` from the `STAGING_ENV_FILE` secret, `pull`, `up -d` with
      `IMAGE_TAG`, `prisma db push --accept-data-loss` executed inside the running `store-api`
      container, retry-looped smoke curls against all three apps)
- [ ] Uses `--accept-data-loss` and `db push` — **not** `migrate deploy` — per the locked owner
      decision and the Overview's rationale; this is the plan's single most important, explicitly
      checked deviation from the raw handoff text
- [ ] `docker-compose.prod.yml`'s three app services reference `${IMAGE_TAG:-staging-latest}` in
      their image tag — verified against plan 123's actual compose file (cross-plan check; if plan
      123 shipped without this parameterization, this task's first sub-step is a small additive
      edit to that file, not a redesign)
- [ ] Local-verifiable (no real SSH — this iteration explicitly does not attempt a real deploy):
      the smoke-check curl/retry logic is extracted into a small shell snippet and dry-run locally
      against plan 123's local `docker compose -f docker-compose.prod.yml up` (from that plan's own
      TASK-270-F) to confirm the retry/backoff loop and the three URLs are correct
- [ ] Manual-qa (append to `docs/manual-qa-pending.md`, explicitly not a blocker): the first real
      SSH deploy to an actual staging VPS, once the owner provisions it and populates the `staging`
      Environment's four secrets

**Files to create/modify:**

- `.github/workflows/ci.yml`
- `docker-compose.prod.yml` — only if the `IMAGE_TAG` parameterization isn't already present from
  plan 123 (small additive edit)
- `docs/manual-qa-pending.md` — one new manual entry

---

### TASK-271-C: `docs/deploy.md` runbook

**Type:** docs
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-271-B (documents the exact commands that task implements)

**Acceptance Criteria:**

- [ ] `docs/deploy.md` (new) covers all five subsections from Design Decision 5, in plain
      Ukrainian, matching the register/format already used in `docs/manual-qa-pending.md` and
      `docs/admin-guide.md`
- [ ] Every command shown is copy-pasteable as written (real service names matching
      `docker-compose.prod.yml`, real flag names)
- [ ] The rollback section explicitly states this is a manual operator action today (no
      one-click automated rollback), and shows exactly where to find the previous good tag
- [ ] Linked from `AGENTS.md`'s "Useful Context Files" list (one-line addition, matching how
      `docs/manual-qa-pending.md` and `docs/admin-guide.md` are already listed there)

**Files to create/modify:**

- `docs/deploy.md` — new
- `AGENTS.md` — one-line addition to "Useful Context Files"

## Dependencies & Sequencing

- **Internal:** A → B → C, strictly sequential (B needs A's job skeleton to extend; C documents
  B's exact commands).
- **External — hard dependency on TASK-270/plan 123:** this plan builds and deploys exactly the
  artifacts that plan defines; it cannot meaningfully start before plan 123's Dockerfiles and
  `docker-compose.prod.yml` exist. If plan 123 and this plan are implemented in parallel worktrees
  regardless, TASK-271-A's local build-verification criterion is the natural sync point — it will
  simply fail until plan 123's Dockerfiles land, which is an acceptable, expected ordering
  dependency rather than a file collision.
- **File-ownership contract with TASK-261 (plan 125) and TASK-270 (plan 123), all three running in
  parallel worktrees:** this plan owns `.github/workflows/ci.yml` (a file neither sibling plan
  touches) and `docs/deploy.md` (new). It touches `docker-compose.prod.yml` only conditionally
  (Design Decision 4's `IMAGE_TAG` parameterization, and only if plan 123 didn't already include
  it) — if both plans land in the same window, this is a small, easily-resolved potential merge
  point on one line of that file, not a structural collision. It does not touch anything under
  `apps/*/src/**` or any Dockerfile.
- **Feeds** TASK-272 (production deploy, future wave) — that plan reuses this one's GHCR
  login/build/push pattern almost verbatim, swapping the trigger branch, Environment name, adding
  the required-reviewer gate, the `pg_dump` backup step, and — the one genuinely new piece of work
  — the squashed migration baseline that finally makes `migrate deploy` viable.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHCR requires a **lowercase** image path; `github.repository_owner` for this repo renders mixed-case (`Oleksii-Bidiak`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Explicit acceptance criterion checks for this; a one-line shell lowercasing step (or a hardcoded lowercase owner string) in the workflow                                                                                                                                                                                                                                                |
| `docker-compose.prod.yml`'s image tags may not yet be parameterized by `IMAGE_TAG` if plan 123 lands first without anticipating rollback                                                                                                                                                                                                                                                                                                                                                                                                                                                | Called out explicitly as a cross-plan check in TASK-271-B; a small, additive, low-risk edit to that one file if needed                                                                                                                                                                                                                                                                  |
| **Discovered while researching this plan, not introduced by it:** the existing `test-e2e`/`test-int` CI jobs run `prisma migrate deploy` against a freshly-created, empty GitHub Actions Postgres service container, but — per this plan's own Overview — only one migration folder is currently git-tracked. A truly fresh runner applying just that one incremental diff to an empty database would fail outright (it drops columns/constraints that don't exist yet). This plan's `deploy-staging` job `needs:` those same jobs, inheriting whatever their actual current health is. | Out of scope to fix here — flagged prominently so it isn't mistaken for something this plan broke; worth a maintainer's own quick check (`gh run list`) independent of this plan's implementation, since if those jobs are in fact failing today, `deploy-staging` would simply never trigger (a safe failure mode, not a silent one) rather than deploying against a broken assumption |
| A deploy landing mid-way through an unrelated developer's investigation of a staging bug could confuse "is this the build I'm looking at"                                                                                                                                                                                                                                                                                                                                                                                                                                               | Every image is tagged with the exact commit sha (`staging-${{ github.sha }}`), and `docs/deploy.md` shows how to check which sha is currently running (`docker compose images` or inspecting the running container's tag)                                                                                                                                                               |
| `prisma db push --accept-data-loss` could silently drop a column/table on staging if a developer's schema change removes something the current staging data still has rows in                                                                                                                                                                                                                                                                                                                                                                                                           | Accepted and by design — staging is explicitly disposable/rebuildable per the owner's own locked decision; called out in the runbook so no developer mistakes a staging data loss for a production risk                                                                                                                                                                                 |
| SSH secret handling: a leaked `SSH_PRIVATE_KEY` or `STAGING_ENV_FILE` secret would expose the whole staging environment                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Both live only in the GitHub `staging` Environment's encrypted secrets, never in workflow YAML or logs; `STAGING_ENV_FILE`'s contents are never echoed by any step (masked by GitHub Actions' own secret-redaction whenever the exact string appears in log output)                                                                                                                     |

## Notes

- Whether the staging host keeps a full git checkout at `/opt/store-ai` (simplest — `docker
compose` just reads the files already there) or only the two files `docker compose` strictly
  needs (`docker-compose.prod.yml`, `Caddyfile`, both of which would then need to be `scp`'d by
  this workflow on every deploy) is left as an implementation-time call in TASK-271-B — either
  works; a full checkout is simpler to keep in sync and is the recommended default unless the owner
  has a specific reason to avoid it (e.g. wanting the server to never hold application source).
- This plan deliberately does not add a Telegram/Slack notification step — GitHub's own UI already
  satisfies the handoff's stated minimum bar, and adding a third-party webhook secret is unnecessary
  surface area for a solo-owner staging environment. A future one-line `curl` step is a trivial
  addition if the owner asks for it later.
- The `db push --accept-data-loss` step runs _after_ `up -d`, i.e. against the **new** `store-api`
  image's `schema.prisma` but potentially before that container has fully passed its own
  healthcheck — acceptable for `db push` (a schema operation, not a request the app needs to be
  "ready" to serve), but the smoke-check step (5) still waits for real HTTP readiness afterward.
