# case-store — Claude Code guide

Multi-brand accessories + Apple-tech e-commerce monorepo (npm workspaces):
`apps/store-api` (NestJS, Clean Architecture, Prisma/PostgreSQL), `apps/store-client` &
`apps/store-admin` (Next.js, Feature-Sliced Design). Project rules are imported below;
the product vision (UA) lives in [requirements.md](requirements.md) — read it when scoping
features, it is intentionally not imported.

@AGENTS.md

## Available subagents (`.claude/agents/`)

- **build** — primary implementation across all workspaces.
- **tdd-agent** — strict Red→Green→Refactor for critical modules (cart, discounts, inventory, auth, orders).
- **architect** — read-only architecture planning (NestJS modules, FSD layers).
- **code-reviewer** — read-only security / Clean Architecture / FSD review.
- **task-planner** — writes `docs/plans/NNN-*.md` and maintains `BACKLOG.md`.
- **git-helper** — explains git/GitFlow, never executes mutating git commands.
- **designer** — UI/UX design + frontend implementation for the `store-client` storefront
  (visual polish, layout, design-system work via `docs/design-system.md`); not for backend/API.

## Available commands (`.claude/commands/`)

`/test` `/review` `/planer <feature>` `/next` `/commit` `/git-help`
`/db-migrate <name>` `/generate-api`

> Note: the custom planning command is `/planer` (not `/plan`) — `/plan` is left to Claude
> Code's built-in plan mode and is intentionally not overridden. Trivial wrappers
> (`/build`, `/lint`, `/dev`, `/db-push`, `/db-seed`, `/db-studio`) were removed — run the
> npm scripts directly (see AGENTS.md §Build, Lint & Test Commands).

## Available skills (`.claude/skills/`)

Invoke the matching skill when its area comes up:

- **api-contract** — Swagger decorators ↔ Orval hook generation; the API contract pipeline.
- **auth-security** — JWT/refresh, guards, RBAC, Helmet/CORS/CSRF, rate limiting (Argon2 hashing).
- **frontend-testing** — frontend tests: Jest two-project setup (node logic + jsdom RTL/MSW) in store-client, jsdom RTL/MSW in store-admin.
- **fsd-component** — building/placing a component within FSD layers + import-direction rules.
- **nestjs-module** — scaffolding a backend feature module (controller→service→repository).
- **nextjs-app-router** — App Router routing, server/client components, metadata/SEO.
- **observability** — Pino structured logging + Sentry error tracking.
- **plan-document** — writing a `docs/plans/NNN-*.md` and keeping `BACKLOG.md` in sync.
- **prisma-migration** — schema changes + migrations. Convention: `isActive` = reversible visibility toggle (admin-only, re-enabled any time); `deletedAt DateTime?` = audit tombstone replacing hard deletes on User/Product/Order (set once, never cleared). Both coexist — they are independent flags.
- **tdd** — Red→Green→Refactor discipline for critical modules.

## Workflow reminders

- Active development branch is **develop**. New work goes on `feature/NNN-name` or
  `fix/NNN-name` branched from `develop` — never commit directly to `main`.
- Implement backend **bottom-up**: Prisma schema → repository → service → controller →
  frontend layers. Services never import PrismaClient; repositories do.
- Frontend imports flow **downward only**: `app → widgets → features → entities → shared`.
- Frontend API calls use **Orval-generated hooks** only — never manual `fetch`/`axios`.
  Generated files live in `**/shared/api/generated/` and must not be hand-edited.
- `BACKLOG.md` is the single source of task status — one-line rows only; narratives go to
  the linked `docs/plans/NNN-*.md`. Mark tasks ✅ when done and tested; manual-only checks
  go to `docs/manual-qa-pending.md`.
- Claude Code PreToolUse hooks block editing `.env*` and generated API files, and block
  commits on `main` (see `.claude/settings.json`); a separate Husky pre-commit runs
  lint-staged. `.ts`/`.tsx` files are auto-formatted on save.
- **Form state sync** — when a form/input is seeded from async server data, follow
  `docs/conventions/forms.md`: never seed `useState` from such a prop without a sync guard
  (render-time guard or `lastPushedRef` `useEffect`; never `key`-remount a focus-sensitive
  input); RHF edit forms use `values` or `reset()` keyed to the entity id, never bare
  `defaultValues`; debounce only via `useDebouncedCallback` (direct import, not the barrel).

Start every reply with my name - Oleksii (Олексій).
