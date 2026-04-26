# Mobile Accessories E-Commerce Store

A modern B2C e-commerce platform for mobile accessories with an admin panel. Built with a monorepo architecture, Clean Architecture on the backend, and Feature-Sliced Design on the frontend.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS, TypeScript, Prisma ORM, PostgreSQL |
| **Storefront** | Next.js (App Router), React, Tailwind CSS |
| **Admin Panel** | Next.js (App Router), React, shadcn/ui, Tailwind CSS |
| **State & Data** | TanStack Query (React Query) |
| **API Contract** | OpenAPI (Swagger) + Orval (auto-generated types & hooks) |
| **Testing** | Jest (unit), Supertest (e2e) |
| **Containerization** | Docker, docker-compose (PostgreSQL, Redis) |
| **AI Dev Environment** | OpenCode (agents, skills, commands) |

## Repository Structure

```
apps/
  store-api/        — NestJS backend (Clean Architecture)
  store-client/     — Next.js storefront (FSD)
  store-admin/      — Next.js admin panel (FSD)
packages/
  eslint-config/    — Shared ESLint configuration
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9 (workspaces support)
- **Docker** & **Docker Compose** (for PostgreSQL & Redis)
- **OpenCode** (optional, for AI-assisted development)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example apps/store-api/.env
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis containers defined in `docker-compose.yml`.

### 4. Set Up Database

```bash
# Generate Prisma Client
npx prisma generate --schema=apps/store-api/prisma/schema.prisma

# Run migrations
npx prisma migrate dev --schema=apps/store-api/prisma/schema.prisma

# (Optional) Seed the database
npx prisma db seed --schema=apps/store-api/prisma/schema.prisma
```

### 5. Run Development Servers

```bash
# Backend
npm run dev -w apps/store-api

# Storefront
npm run dev -w apps/store-client

# Admin panel
npm run dev -w apps/store-admin
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build all workspaces |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run test` | Run all unit tests |
| `npm run test:e2e` | Run e2e tests (store-api) |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run build -w apps/store-api` | Build backend only |
| `npm run test -w apps/store-api` | Test backend only |
| `npm run lint -w apps/store-client` | Lint storefront only |

## Architecture

### Backend — Clean Architecture (NestJS)

Every feature module follows a layered structure:

```
feature/
  feature.controller.ts       — Routes, DTO validation, HTTP responses ONLY
  feature.service.ts           — Business logic ONLY
  feature.repository.ts        — Database access through Prisma ONLY
  feature.module.ts            — Module registration
  dto/                         — Request DTOs with class-validator
  entities/                    — Domain entities (not Prisma models)
```

**Dependency rule:** Controller → Service → Repository. Never skip layers.

### Frontend — Feature-Sliced Design (Next.js)

```
src/
  app/          — App Router, providers, layouts
  widgets/      — Composite UI blocks (Header, ProductCard)
  features/    — Business interactions (AddToCart, CheckoutForm)
  entities/     — Domain models & API hooks (Orval-generated)
  shared/       — UI kit (shadcn), utils, generated API client
```

**Import direction:** `app → widgets → features → entities → shared`. Never upward.

## OpenCode AI Setup

This project includes a pre-configured OpenCode environment with specialized agents, skills, and commands.

### Project Planning & Task Management

This project uses **document-driven planning** — plans are saved as files, not lost in chat history.

```
docs/
  roadmap.md          ← Project phases and milestones
  plans/              ← Detailed feature plans (persistent, git-tracked)
    001-cart.md
    002-checkout.md
    ...
BACKLOG.md            ← Single source of truth for task status
```

**How it works in practice:**

| You say | What happens |
|---------|-------------|
| `/plan Cart module with discounts` | `@task-planner` creates `docs/plans/001-cart.md` and updates `BACKLOG.md` |
| `What's next?` or `/next` | Reads `BACKLOG.md`, suggests the next ⬜ task |
| `Implement TASK-004` | `@build` reads the plan and implements the task |
| `/review` | `@code-reviewer` checks for security & architecture issues |
| Task done | Update `BACKLOG.md`: ⬜ → ✅ |

**Status tracking in `BACKLOG.md`:**

| Symbol | Meaning |
|--------|---------|
| ⬜ | To Do |
| 🔄 | In Progress |
| ✅ | Done |
| ❌ | Blocked |

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **build** | GLM-5.1 | Primary agent — full development with all tools |
| **plan** | Kimi K2.5 | Planning & analysis — read-only, no modifications |
| **code-reviewer** | GLM-5 | Code review — security, architecture, quality (read-only) |
| **architect** | Kimi K2.5 | Architecture planning — FSD, Clean Arch (read-only) |
| **tdd-agent** | GLM-5.1 | TDD implementation — Red → Green → Refactor cycle |
| **task-planner** | Qwen3.6 Plus | Creates persistent plans in `docs/plans/` and updates `BACKLOG.md` |
| **git-helper** | GLM-5.1 | Git assistant — explains commands, suggests commits, helps with GitFlow (read-only) |

### Skills

| Skill | Purpose |
|-------|---------|
| `@tdd` | Test-Driven Development workflow with NestJS/Jest patterns |
| `@nestjs-module` | Scaffold a new NestJS module (Controller-Service-Repository) |
| `@fsd-component` | Create Next.js components following FSD architecture |
| `@prisma-migration` | Prisma schema design and migration best practices |
| `@plan-document` | Generate structured plan documents with task breakdowns |
| `@nextjs-app-router` | Next.js App Router: Server/Client Components, data fetching, layouts, middleware, SEO |
| `@auth-security` | JWT auth with refresh rotation, guards, CORS, Helmet, rate limiting |
| `@api-contract` | OpenAPI (Swagger) → Orval pipeline for typed API hooks |
| `@frontend-testing` | React Testing Library, Vitest, MSW for component and hook testing |
| `@observability` | Pino structured logging + Sentry error tracking (backend + frontend) |

### Commands

| Command | Description |
|---------|-------------|
| `/plan <feature>` | Generate a persistent implementation plan and update backlog |
| `/next` | Suggest the next task from the backlog |
| `/commit` | Analyze changes and suggest a conventional commit message |
| `/git-help` | Git help — explain commands, suggest next steps, answer questions |
| `/test` | Run tests with coverage and fix failures |
| `/lint` | Run ESLint + TypeScript checks and fix issues |
| `/review` | Code review with security & architecture focus |
| `/dev` | Start development servers (Docker + API + storefront + admin) |
| `/build` | Build all workspaces |
| `/generate-api` | Generate Orval API hooks from OpenAPI spec |
| `/db-push` | Push Prisma schema to DB (dev only) |
| `/db-migrate <name>` | Create and apply a Prisma migration |
| `/db-seed` | Seed the database with development data |
| `/db-studio` | Open Prisma Studio database browser |

### Typical Development Flow

Below is the complete step-by-step workflow for working on a task — from picking it up to merging it back.

#### Step 1: Find the next task

```
You: /next
→ Agent reads BACKLOG.md and suggests: "TASK-006: Design and create Prisma schema (User, Product, Category)"
```

If you already know what you want to work on, check `BACKLOG.md` directly or use `/plan` to create a detailed plan first.

#### Step 2: Create a feature branch

```
You: /git-help I want to start TASK-006
→ Agent shows:
  📝 git checkout develop
  📝 git pull origin develop
  📝 git checkout -b feature/006-prisma-schema

  💡 Why: Every new feature starts in its own branch from develop.
     The branch name includes the TASK ID for traceability.
```

Run the commands yourself. The agent never runs git commands for you.

#### Step 3: Plan the feature (if no plan exists)

```
You: /plan Prisma schema for User, Product, Category
→ @task-planner creates docs/plans/006-prisma-schema.md
→ BACKLOG.md updated with TASK-006 referencing the plan
```

This step is optional but recommended for complex features. Simple tasks (bug fixes, config changes) can skip it.

#### Step 4: Implement the feature

For regular features:
```
You: Implement TASK-006 — create the Prisma schema
→ @build agent reads the plan, implements bottom-up (data model → repository → service → controller)
```

For critical modules (cart, discounts, auth, orders):
```
You: @tdd-agent Implement TASK-021 — Cart module
→ Agent follows Red → Green → Refactor cycle with tests first
```

#### Step 5: Save intermediate work (WIP commits)

If you need to save progress before finishing:

```
You: /commit WIP
→ Agent analyzes changes and suggests:
  feat(database): WIP Prisma schema — User and Product done, Category pending

  📝 git add apps/store-api/prisma/schema.prisma
  📝 git commit -m "feat(database): WIP Prisma schema — User and Product done, Category pending"

  💡 Why: WIP commits save your progress. Squash them before merging to develop.
```

#### Step 6: Final commit

When the feature is complete:

```
You: /commit
→ Agent analyzes all changes and suggests:
  feat(database): add initial Prisma schema with User, Product, Category models

  📝 Why feat: this is a new feature (database schema)
  📝 Why database scope: all changes are in the Prisma schema
  📝 Why this description: describes what was added in imperative mood

  📝 git add apps/store-api/prisma/
  📝 git commit -m "feat(database): add initial Prisma schema with User, Product, Category models"
```

If you have WIP commits, squash them first:
```
You: /git-help how to squash my WIP commits
→ Agent explains git rebase -i or git commit --amend
```

#### Step 7: Verify your work

```
You: /lint
→ Runs ESLint + TypeScript checks, reports issues

You: /test
→ Runs unit tests, reports failures

You: /review
→ @code-reviewer checks for security, architecture, and quality issues
```

Fix any issues found, then commit the fixes.

#### Step 8: Push and create a Pull Request

```
You: /git-help I finished TASK-006, how do I push?
→ Agent shows:
  📝 git push -u origin feature/006-prisma-schema

  💡 Why: -u sets the upstream branch so future pushes only need "git push".

  Then create a PR on GitHub:
  📝 gh pr create --base develop --title "feat(database): add initial Prisma schema" --body "..."
```

#### Step 9: Update the backlog

After merging the PR:
```
You: /git-help how to merge and clean up
→ Agent shows how to switch back to develop, pull, and delete the feature branch

Then manually update BACKLOG.md:
  TASK-006: ⬜ → ✅
```

### Complete Workflow Diagram

```
  ┌─────────────────────────────────────────────────────────┐
  │                    START A TASK                          │
  │                                                         │
  │  /next ──→ Pick task ──→ /git-help start branch         │
  │                                    │                    │
  │                                    ▼                    │
  │                          Create feature/XXX-name        │
  │                                    │                    │
  │                                    ▼                    │
  │                    /plan (if complex feature)            │
  │                                    │                    │
  │                                    ▼                    │
  │                         IMPLEMENT                       │
  │                    @build or @tdd-agent                 │
  │                                    │                    │
  │                           ┌────────┴────────┐          │
  │                           │  Need to save?   │          │
  │                           └────────┬────────┘          │
  │                              Yes │     │ No             │
  │                                  ▼     │                │
  │                         /commit WIP    │                │
  │                                  │     │                │
  │                                  └──┬──┘                │
  │                                     ▼                   │
  │                              /commit (final)            │
  │                                     │                   │
  │                                     ▼                   │
  │                    /lint ──→ /test ──→ /review          │
  │                                     │                   │
  │                                     ▼                   │
  │                    /git-help push & create PR           │
  │                                     │                   │
  │                                     ▼                   │
  │                    Update BACKLOG.md: ⬜ → ✅           │
  └─────────────────────────────────────────────────────────┘
```

### Git Commands Cheat Sheet

| Situation | What to do | OpenCode command |
|-----------|-----------|-----------------|
| Don't know what to work on | Find the next task | `/next` |
| Start a new feature | Create a branch from develop | `/git-help I want to start TASK-XXX` |
| Save intermediate work | Make a WIP commit | `/commit WIP` |
| Commit finished work | Make a clean conventional commit | `/commit` |
| Check what changed | See current status | `/git-help what's my current status?` |
| Push changes | Push branch to remote | `/git-help how to push my branch?` |
| Merge with develop | Update your branch with latest develop | `/git-help how to merge develop into my branch?` |
| Resolve a conflict | Fix merge conflicts | `/git-help I have merge conflicts` |
| Not sure what to do next | Get guidance | `/git-help what should I do next?` |
| Forgot git command | Ask anything about git | `/git-help <your question>` |

### Troubleshooting

#### `npm install` fails with dependency errors

```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

If a workspace dependency fails, make sure the workspace `package.json` exists:
```bash
ls apps/store-api/package.json apps/store-client/package.json apps/store-admin/package.json
```

#### `docker compose up -d` fails

```bash
# Check if Docker is running
docker info

# Check if ports 5432 or 6379 are already in use
netstat -an | grep 5432    # PostgreSQL
netstat -an | grep 6379    # Redis

# Stop and restart containers
docker compose down
docker compose up -d
```

#### `prisma migrate dev` fails with connection error

```bash
# Verify DATABASE_URL in .env
cat apps/store-api/.env | grep DATABASE_URL

# Expected: postgresql://postgres:postgres@localhost:5432/store_dev

# Check if PostgreSQL container is running
docker compose ps postgres

# If not running, start it
docker compose up -d postgres
```

#### `npm run lint` fails with "No files matching the pattern"

This means workspace packages don't exist yet. The project needs at least one workspace to lint:
```bash
# Check which workspaces exist
ls -d apps/*/  packages/*/
```

If empty, scaffold the workspaces first (see Getting Started).

#### `npm run typecheck` fails with "Cannot find module"

```bash
# Regenerate Prisma Client
npx prisma generate --schema=apps/store-api/prisma/schema.prisma

# Reinstall dependencies
npm install
```

#### Pre-commit hook fails (Husky + lint-staged)

```bash
# The hook runs ESLint and Prettier on staged files
# If it fails, fix the issues and re-commit:
npm run lint
npm run lint --fix

# If you need to skip hooks temporarily (NOT recommended):
git commit --no-verify -m "feat(scope): description"
```

#### `npm run test` fails with "Cannot find module"

```bash
# Build the workspace first
npm run build -w apps/store-api

# Then run tests
npm run test -w apps/store-api
```

#### Prisma MCP server fails to start

The Prisma MCP server requires:
1. `apps/store-api/prisma/schema.prisma` to exist
2. `DATABASE_URL` environment variable to be set
3. PostgreSQL container to be running

```bash
# Check if schema exists
ls apps/store-api/prisma/schema.prisma

# Check if DATABASE_URL is set
echo $DATABASE_URL

# Start PostgreSQL
docker compose up -d postgres
```

#### Orval API generation fails

```bash
# Make sure the backend is running and Swagger is accessible
curl http://localhost:3000/api/docs-json

# If not running, start it first
npm run start:dev -w apps/store-api

# Then generate
npm run generate-api
```

### MCP Servers

| Server | Type | Purpose | Status |
|--------|------|---------|--------|
| **Context7** | Remote | Search documentation for NestJS, Next.js, Prisma | ✅ Enabled |
| **Prisma** | Local | Direct Prisma schema interaction and queries | ⬜ Disabled (enable after schema exists) |
| **Sentry** | Remote | Error monitoring and issue tracking | ⬜ Disabled (enable after Sentry integration) |

## Testing Strategy

For critical modules (cart calculations, discounts, inventory management, authentication), follow **TDD**:

1. **Red** — Write a failing test
2. **Green** — Write the minimum code to pass
3. **Refactor** — Improve while keeping tests green

## Git Workflow

### Branching Strategy (GitFlow)

```
main           — Production-ready code. Only merge via PR from develop.
  └── develop  — Active development. All feature branches merge here.
       ├── feature/XXX-name   — Feature branches
       └── fix/XXX-name       — Bugfix branches
```

Branch naming uses TASK IDs from `BACKLOG.md`:
- `feature/010-auth` — for TASK-010 (Auth module)
- `fix/014-discount-calc` — for a bug fix

### Conventional Commits

Format: `type(scope): description`

| Type | When to use | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): implement JWT refresh token rotation` |
| `fix` | Bug fix | `fix(cart): correct discount calculation for percentage coupons` |
| `refactor` | Code improvement (no behavior change) | `refactor(order): extract order state machine into service` |
| `test` | Adding tests | `test(auth): add e2e tests for login and refresh flow` |
| `docs` | Documentation | `docs: update README with setup instructions` |
| `chore` | Technical tasks (deps, config) | `chore: update husky pre-commit hooks` |
| `ci` | CI/CD changes | `ci: add GitHub Actions workflow for lint and test` |
| `style` | Formatting (no logic change) | `style: fix indentation in auth module` |

**Rules:**
- Imperative mood: "add" not "added", "fix" not "fixed"
- Lowercase description, no period at the end
- Scope = feature module name (auth, cart, product, order, user, admin)
- One commit = one logical change

### WIP (Work In Progress) Commits

When you need to save intermediate work:

```
feat(auth): WIP refresh token rotation — service done, controller pending
```

Use WIP commits when:
- Switching branches before finishing a feature
- End of day and you're not done yet
- Before a risky refactor (as a backup)
- Creating a draft PR

**Important:** Squash or amend WIP commits into clean ones before merging to `develop`.

### Git Help

Use `/commit` to analyze your changes and get a suggested commit message with explanations.
Use `/git-help` for any git question — branching, merging, conflicts, or "what should I do next?"

## Security

- **Auth:** JWT with short-lived Access Tokens + HttpOnly Refresh Cookies
- **Validation:** class-validator (backend), zod (frontend)
- **CORS:** Explicitly configured origins
- **Rate Limiting:** Applied to auth endpoints and public APIs
- **Helmet:** Secure HTTP headers on NestJS
- **Secrets:** Environment variables only — never commit `.env` files

## API Contract

1. NestJS generates OpenAPI spec from Swagger decorators
2. Orval reads the spec and generates typed API hooks in `shared/api/generated/`
3. Frontend MUST use generated hooks — never manual `fetch`/`axios`

## Logging & Monitoring

- **Backend:** Pino for structured JSON logging
- **Frontend:** Sentry for error tracking and unhandled rejections
- **Request logging:** Middleware logs HTTP request duration

## License

Private — All rights reserved.