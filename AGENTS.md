# Mobile Accessories E-Commerce Store — Project Rules

## Overview

B2C e-commerce platform for multi-brand accessories and Apple tech with an admin panel
(evolving toward a CRM for content management). Iterative development with a focus on
scalability, security, and reliability. **This file is the single source of truth for
project rules** — other docs link here instead of restating them.

## Repository Structure

Monorepo managed with npm workspaces:

```
apps/
  store-api/        — NestJS backend (Clean Architecture)
  store-client/     — Next.js storefront (FSD)
  store-admin/      — Next.js admin panel (FSD)
packages/
  eslint-config/    — Shared ESLint configuration
```

## Technology Stack

- **Backend:** NestJS, TypeScript, Prisma ORM, PostgreSQL
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui (admin)
- **State & Data:** TanStack Query (React Query)
- **API Contract:** OpenAPI (Swagger) + Orval (auto-generated types & hooks)
- **Testing:** Jest (unit), Supertest (e2e)
- **Search:** Meilisearch (typo-tolerant full-text; graceful Postgres fallback)
- **Containerization:** Docker, docker-compose (PostgreSQL, Redis, Meilisearch)

## Build, Lint & Test Commands

| Command                  | Description                                   |
| ------------------------ | --------------------------------------------- |
| `npm run build`          | Build all workspaces                          |
| `npm run lint`           | Run ESLint across all workspaces              |
| `npm run test`           | Run all unit tests                            |
| `npm run test:e2e`       | Run e2e tests (store-api)                     |
| `npm run typecheck`      | Run TypeScript type checking (`tsc --noEmit`) |
| `npx prisma migrate dev` | Create and apply a new Prisma migration       |
| `npx prisma db push`     | Push schema to DB without migration (dev)     |
| `npx prisma generate`    | Regenerate Prisma Client                      |

**Workspace-specific commands** should be run from the workspace root:

- `npm run build -w apps/store-api`
- `npm run test -w apps/store-api`
- `npm run lint -w apps/store-client`

## Backend Conventions (NestJS — Clean Architecture)

### Layered Architecture

Every feature module MUST follow this structure:

```
feature/
  feature.controller.ts       — Routes, DTO validation, HTTP responses ONLY
  feature.service.ts           — Business logic ONLY
  feature.repository.ts        — Database access through Prisma ONLY
  feature.module.ts            — Module registration
  dto/
    create-feature.dto.ts
    update-feature.dto.ts
  entities/
    feature.entity.ts          — Domain entity (not Prisma model)
```

### Key Rules

1. **Controllers** must not contain business logic. Validate input with `class-validator` DTOs and delegate to services.
2. **Services** must not directly import PrismaClient. Use repository classes instead.
3. **Repositories** encapsulate all Prisma queries. Return domain entities, not raw Prisma objects.
4. Use NestJS **modules** for encapsulation — each feature is a self-contained module.
5. All API responses follow a consistent envelope: `{ data, meta? }` or `{ error, message, statusCode }`.

### Validation

- **Backend:** `class-validator` + `class-transformer` for all DTOs in request validation pipes.
- **Frontend:** `zod` schemas for form validation and runtime type safety.

## Frontend Conventions (Next.js — Feature-Sliced Design)

### FSD Layer Structure

```
src/
  app/          — App router, providers, layouts
  widgets/      — Composite UI blocks (Header, ProductCard, Footer)
  features/    — Business interactions (AddToCart, CheckoutForm, Auth)
  entities/     — Domain models & API hooks (User, Product, Order)
  shared/       — UI kit (shadcn), utils, generated API client (Orval)
```

### Key Rules

1. **Import direction:** A layer MAY import only from layers below it: `app → widgets → features → entities → shared`. Never upward.
2. **shared/ui** contains "dumb" components with no business logic. Use shadcn/ui as the base.
3. **features/** components use Orval-generated hooks (`useMutation`, `useQuery`).
4. **widgets/** compose features and entities into standalone blocks.
5. Use Tailwind CSS with semantic design tokens. Tailwind v4 is CSS-first — there is **no `tailwind.config.ts`**; tokens are declared in `@theme inline` inside `apps/store-client/src/app/globals.css` (storefront) and `apps/store-admin/src/app/globals.css` (admin). Never use raw hex values in markup.
6. Ensure accessibility (a11y): keyboard navigation, ARIA attributes, screen-reader support.

## Testing Strategy (TDD)

For critical modules (cart calculations, discounts, inventory management), follow **Red → Green → Refactor**:

1. **Red:** Write a failing test for the new requirement.
2. **Green:** Write the minimum code to pass the test.
3. **Refactor:** Improve the code while keeping all tests green.

Always run relevant tests after changes:

```bash
npm run test -w apps/store-api
npm run test -w apps/store-client
```

## Security

- **Auth:** JWT with short-lived Access Tokens + HttpOnly Refresh Cookies.
- **Validation:** Strict input validation on all endpoints (class-validator DTOs, zod on frontend).
- **CORS:** Configure allowed origins explicitly.
- **Rate Limiting:** Apply to auth endpoints and public APIs.
- **Helmet:** Enabled on NestJS for secure HTTP headers.
- **Secrets:** All credentials stored in `.env` files — `.env` is in `.gitignore`. Never commit secrets.

## Git Workflow

### Branching Strategy (GitFlow)

```
main           — Production-ready code. Only merge via PR from develop.
  └── develop  — Active development. All feature branches merge here.
       ├── feature/001-cart       — Feature branches
       ├── feature/002-auth
       ├── feature/003-checkout
       └── fix/004-discount-calc  — Bugfix branches
```

### Git Quick Reference

If you're not comfortable with git, here are the commands you'll use most:

```bash
# Start a new feature (from develop)
git checkout develop
git pull origin develop
git checkout -b feature/001-cart

# Save your work (commit)
git add .
git commit -m "feat(cart): add cart repository and service"

# Push to remote
git push origin feature/001-cart

# Get latest changes from develop
git checkout develop
git pull origin develop
git checkout feature/001-cart
git merge develop

# After PR is merged, clean up
git branch -d feature/001-cart
git push origin --delete feature/001-cart
```

### Commit Message Format

All commits MUST follow conventional format:

```
type(scope): description
```

**Template examples for this project:**

| Type       | Scope     | Example Commit                                                   |
| ---------- | --------- | ---------------------------------------------------------------- |
| `feat`     | `cart`    | `feat(cart): add CartRepository with Prisma queries`             |
| `feat`     | `auth`    | `feat(auth): implement JWT refresh token rotation`               |
| `feat`     | `product` | `feat(product): add product listing with pagination`             |
| `feat`     | `ui`      | `feat(ui): create ProductCard widget with AddToCart feature`     |
| `feat`     | `admin`   | `feat(admin): add product CRUD management page`                  |
| `fix`      | `cart`    | `fix(cart): correct discount calculation for percentage coupons` |
| `fix`      | `auth`    | `fix(auth): prevent refresh token reuse after rotation`          |
| `refactor` | `order`   | `refactor(order): extract order state machine into service`      |
| `test`     | `cart`    | `test(cart): add unit tests for cart total with discounts`       |
| `test`     | `auth`    | `test(auth): add e2e tests for login and refresh flow`           |
| `docs`     | —         | `docs: update README with planning workflow`                     |
| `chore`    | —         | `chore: update husky pre-commit hooks`                           |
| `ci`       | —         | `ci: add GitHub Actions workflow for lint and test`              |

**Rules:**

- Use **imperative mood**: "add" not "added", "fix" not "fixed"
- Lowercase description, no period at the end
- Scope is the feature module name (cart, auth, product, order, user, admin)
- One commit = one logical change (don't mix feat+fix in one commit)

### Pre-commit Hooks

Husky + lint-staged runs automatically on commit:

- ESLint on staged `.ts` / `.tsx` files
- Prettier formatting on staged files

If hooks fail, fix the issues and re-commit. To skip hooks (NOT recommended): `git commit --no-verify`

## API Contract (OpenAPI + Orval)

1. Backend generates OpenAPI spec from NestJS Swagger decorators.
2. Orval reads the spec and generates typed API hooks in `shared/api/generated/`.
3. Frontend MUST use generated hooks — never write manual `fetch`/`axios` calls for API communication.

## Logging & Monitoring

- **Backend:** Use `Pino` for structured JSON logging. Log errors and critical business events (order creation, registration).
- **Frontend:** Integrate `Sentry` for error tracking and unhandled rejection capture.
- **Request logging:** Middleware logs HTTP request duration.

## Useful Context Files

When working on this project, read these files for additional context:

- `requirements.md` — Product vision & niche (UA)
- `BACKLOG.md` — Task status and roadmap (one-line rows; details in `docs/plans/NNN-*.md`)
- `docs/payments-liqpay.md` — **online payments (UA)**: the LiqPay contract as we implement
  it — merchant onboarding, the full checkout→callback→reconcile flow, status map, sandbox
  cards, the "where to look when it breaks" table, BNPL. Written before the code because
  LiqPay's own docs are fragmented and partly 404; this file is the source of truth for our
  contract. Read it before touching anything under `apps/store-api/src/payment/`
- `docs/design-system.md` — Storefront design tokens & UI conventions
- `docs/conventions/forms.md` — Form state-sync rules (async-seeded forms)
- `docs/seed-guide.md` — Seeding the dev database: reset, admin credentials, what gets seeded
- `docs/user-stories.md` — **What the system actually does (UA)**: journeys of five personas
  (guest, customer, owner, content manager, order operator) with per-step readiness states,
  the stable `E-NN` edge-case catalogue and a gap → TASK traceability table. Revised
  2026-07-29 after Етап 8. Read it before claiming a feature is missing — several are not
- `docs/manual-qa-pending.md` — **Launch Gate (UA)**: the narrow, risk-ordered "we do not
  launch without this" run (LG-1…LG-9), plus accepted 🟡 risks and per-TASK tails
- `docs/qa-manual-full.md` — **Exhaustive manual regression (UA)**: every storefront and
  admin route and every RBAC permission, `ZONE-nn` ids, two completeness appendices
  (route → check, permission → check). Use for regression; use `manual-qa-pending.md`
  before launch
- `docs/admin-guide.md` — Admin-panel onboarding guide (UA, for non-technical operators)
- `docs/presentation.md` — Product presentation for the client (UA): what the storefront
  does, what the admin panel does, and an honest "not there yet" section
- `docs/demo-script.md` — ~25-minute live demo script (UA): what to open, what to say, which
  demo accounts to use
- `docs/README.md` — Map of all documentation; start here when you don't know what to open
- `docs/deploy/` — **Deploy & operations, in order** (UA, for non-technical operators). Numbered: the number is the step, not a chapter. Entry point `docs/deploy/00-start-here.md`. The canonical path is self-hosted VPS + Docker + Caddy; the old Vercel/Railway runbook is superseded and parked in `docs/archive/`
  - `01-accounts-access.md` — who owns which account (developer vs business client), password manager, 2FA + recovery codes, who holds the `age`/SSH keys, access recovery, handover. Read before spending money
  - `02-domain-dns.md` — the client's domain: three hostnames on one registrable domain (`sameSite=strict` + `__Host-` make this non-negotiable), A records, mail DNS. Sends from a subdomain so the client's root SPF is never touched
  - `03-server.md` … `09-pre-launch.md` — servers, secrets/CI, first deploy, day-to-day + incident playbook, rollback, backup/restore, the single pre-launch checklist
  - `05a-analytics.md` — turning Umami on. Read it before touching anything analytics-related: the step is inherently two-phase (the website id exists only once Umami is running, and `NEXT_PUBLIC_*` are baked at build time), and without a public `analytics.<domain>` the tracker cannot load at all — every container reports healthy while nothing is recorded
- `docs/legal-checklist.md` — What Ukrainian e-commerce law requires of the storefront (UA; a checklist for a lawyer, not legal advice)
