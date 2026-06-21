# store-ai — Claude Code guide

Mobile-accessories e-commerce monorepo (npm workspaces): `apps/store-api` (NestJS,
Clean Architecture, Prisma/PostgreSQL), `apps/store-client` & `apps/store-admin`
(Next.js, Feature-Sliced Design). Full project rules are imported below.

@requirements.md
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

`/dev` `/build` `/test` `/lint` `/review` `/planer <feature>` `/next`
`/commit` `/git-help` `/db-push` `/db-migrate <name>` `/db-seed` `/db-studio` `/generate-api`

> Note: the custom planning command is `/planer` (not `/plan`) — `/plan` is left to Claude
> Code's built-in plan mode and is intentionally not overridden.

## Available skills (`.claude/skills/`)

Invoke the matching skill when its area comes up:

- **api-contract** — Swagger decorators ↔ Orval hook generation; the API contract pipeline.
- **auth-security** — JWT/refresh, guards, RBAC, Helmet/CORS/CSRF, rate limiting (Argon2 hashing).
- **frontend-testing** — frontend tests (current: Jest/ts-jest logic tests; RTL+MSW is target state).
- **fsd-component** — building/placing a component within FSD layers + import-direction rules.
- **nestjs-module** — scaffolding a backend feature module (controller→service→repository).
- **nextjs-app-router** — App Router routing, server/client components, metadata/SEO.
- **observability** — Pino structured logging + Sentry error tracking.
- **plan-document** — writing a `docs/plans/NNN-*.md` and keeping `BACKLOG.md` in sync.
- **prisma-migration** — schema changes + migrations (note: `isActive` deactivation, no soft deletes).
- **tdd** — Red→Green→Refactor discipline for critical modules.

## Workflow reminders

- Active development branch is **develop**. New work goes on `feature/NNN-name` or
  `fix/NNN-name` branched from `develop` — never commit directly to `main`.
- Implement backend **bottom-up**: Prisma schema → repository → service → controller →
  frontend layers. Services never import PrismaClient; repositories do.
- Frontend imports flow **downward only**: `app → widgets → features → entities → shared`.
- Frontend API calls use **Orval-generated hooks** only — never manual `fetch`/`axios`.
  Generated files live in `**/shared/api/generated/` and must not be hand-edited.
- `BACKLOG.md` is the single source of task status — mark tasks ✅ when done and tested.
- A pre-commit hook blocks editing `.env*` and generated API files, and blocks commits
  on `main` (see `.claude/settings.json`). `.ts`/`.tsx` files are auto-formatted on save.
