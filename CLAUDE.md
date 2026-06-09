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

## Available commands (`.claude/commands/`)

`/dev` `/build` `/test` `/lint` `/review` `/plan <feature>` `/next`
`/commit` `/git-help` `/db-push` `/db-migrate <name>` `/db-seed` `/db-studio` `/generate-api`

## Available skills (`.claude/skills/`)

`api-contract` `auth-security` `frontend-testing` `fsd-component` `nestjs-module`
`nextjs-app-router` `observability` `plan-document` `prisma-migration` `tdd`

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
