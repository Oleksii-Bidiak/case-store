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

Copy the example env files and fill in your values:

```bash
cp apps/store-api/.env.example apps/store-api/.env
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

### Skills

| Skill | Purpose |
|-------|---------|
| `@tdd` | Test-Driven Development workflow with NestJS/Jest patterns |
| `@nestjs-module` | Scaffold a new NestJS module (Controller-Service-Repository) |
| `@fsd-component` | Create Next.js components following FSD architecture |
| `@prisma-migration` | Prisma schema design and migration best practices |
| `@plan-document` | Generate structured plan documents with task breakdowns |

### Commands

| Command | Description |
|---------|-------------|
| `/plan <feature>` | Generate a persistent implementation plan and update backlog |
| `/next` | Suggest the next task from the backlog |
| `/test` | Run tests with coverage and fix failures |
| `/lint` | Run ESLint + TypeScript checks and fix issues |
| `/review` | Code review with security & architecture focus |
| `/db-push` | Push Prisma schema to DB (dev only) |
| `/db-migrate <name>` | Create and apply a Prisma migration |

### Typical Development Flow

```
Day 1: Planning
  You: /plan Cart module with discount system
  → docs/plans/001-cart.md created
  → BACKLOG.md updated with TASK-021 through TASK-030

Day 2: Implementation
  You: /next
  → "Start with TASK-021: Implement Cart module (backend) — TDD"
  You: @tdd-agent Implement TASK-021 from docs/plans/001-cart.md
  → Agent reads the plan, implements using TDD cycle

Day 3: Continue
  You: What's next?
  → "TASK-022: CartRepository — depends on TASK-021 ✅"
  You: Implement TASK-022
  → Build agent reads the plan, implements

Day 4: Review
  You: /review
  → code-reviewer checks for security & architecture issues
```

### MCP Servers

| Server | Purpose |
|--------|---------|
| **Context7** | Search documentation for NestJS, Next.js, Prisma |
| **Prisma** | Direct Prisma schema interaction and queries |
| **Sentry** | Error monitoring and issue tracking |

## Testing Strategy

For critical modules (cart calculations, discounts, inventory management, authentication), follow **TDD**:

1. **Red** — Write a failing test
2. **Green** — Write the minimum code to pass
3. **Refactor** — Improve while keeping tests green

## Git Workflow

- `main` — Production-ready code
- `develop` — Active development branch
- `feature/*` — Feature branches merged to `develop` via PR

Commit format: `type(scope): description` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`)

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