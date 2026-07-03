# Mobile Accessories & Tech E-Commerce Store

A B2C e-commerce platform (storefront + admin panel) for multi-brand accessories and Apple
tech, built as an npm-workspaces monorepo: NestJS + Prisma/PostgreSQL backend (Clean
Architecture), two Next.js App Router frontends (Feature-Sliced Design).

| Doc                                                      | What's in it                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                 | **The rules** — architecture, conventions, testing, git workflow (single source of truth) |
| [`requirements.md`](requirements.md)                     | Product vision & niche (UA)                                                               |
| [`BACKLOG.md`](BACKLOG.md)                               | Task status & roadmap (single source of truth for "what's next")                          |
| [`CLAUDE.md`](CLAUDE.md)                                 | Claude Code setup — agents, skills, commands                                              |
| [`docs/design-system.md`](docs/design-system.md)         | Storefront design tokens & UI conventions                                                 |
| [`docs/conventions/forms.md`](docs/conventions/forms.md) | Form state-sync rules                                                                     |

## Tech Stack

| Layer                  | Technology                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Backend**            | NestJS, TypeScript, Prisma ORM, PostgreSQL                                       |
| **Storefront / Admin** | Next.js (App Router), React, Tailwind CSS, shadcn/ui                             |
| **State & Data**       | TanStack Query via Orval-generated hooks (OpenAPI contract)                      |
| **Search**             | Meilisearch (typo-tolerant full-text, graceful Postgres fallback)                |
| **Testing**            | Jest + RTL + MSW (unit/component), Supertest (API e2e), Playwright (browser e2e) |
| **Infra**              | Docker Compose (PostgreSQL, Redis, Meilisearch), Pino, Sentry                    |

## Repository Structure

```
apps/
  store-api/        — NestJS backend (Clean Architecture)
  store-client/     — Next.js storefront (FSD)
  store-admin/      — Next.js admin panel (FSD)
packages/
  eslint-config/    — Shared ESLint configuration
docs/               — Design system, conventions, plans (docs/plans/NNN-*.md), QA lists
```

## Getting Started

Prerequisites: Node.js ≥ 18, npm ≥ 9, Docker + Docker Compose.

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example apps/store-api/.env    # fill in values

# 3. Infrastructure (PostgreSQL, Redis, Meilisearch)
docker compose up -d

# 4. Database
npm run db:generate      # Prisma client
npm run db:migrate       # migrations
npm run db:seed          # optional dev data

# 5. Dev servers (each in its own terminal)
npm run dev -w apps/store-api
npm run dev -w apps/store-client
npm run dev -w apps/store-admin
```

## Commands

| Command                                                                    | Description                                  |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| `npm run build` / `lint` / `test` / `typecheck`                            | All workspaces                               |
| `npm run test:e2e`                                                         | API e2e tests (store-api)                    |
| `npm run test:e2e:pw`                                                      | Playwright browser e2e (needs booted stack)  |
| `npm run generate:api`                                                     | Regenerate Orval hooks from the OpenAPI spec |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:seed` / `db:studio` | Prisma                                       |
| `npm run <script> -w apps/<workspace>`                                     | Scope any script to one workspace            |

Architecture rules, FSD/Clean-Architecture layering, TDD policy, GitFlow branching and the
conventional-commit format all live in [`AGENTS.md`](AGENTS.md) — read it before contributing.

## Troubleshooting

- **`docker compose up` fails** — check Docker is running and ports 5432/6379/7700 are free;
  `docker compose down && docker compose up -d`.
- **`prisma migrate dev` connection error** — verify `DATABASE_URL` in `apps/store-api/.env`
  and that the `postgres` container is up (`docker compose ps`).
- **`Cannot find module` in tests/typecheck** — `npm run db:generate`, then `npm install`.
- **Orval generation fails** — the spec is exported offline via `npm run swagger:export -w apps/store-api`,
  then `npm run generate:api`; check the API workspace builds first.
- **Pre-commit hook fails** — Husky + lint-staged runs ESLint/Prettier on staged files; fix and
  re-commit (don't `--no-verify`).
- **Search returns Postgres-fallback results** — start Meilisearch
  (`docker compose up -d meilisearch`) and set `MEILI_HOST`/`MEILI_MASTER_KEY` in the API `.env`.

## License

Private — All rights reserved.
