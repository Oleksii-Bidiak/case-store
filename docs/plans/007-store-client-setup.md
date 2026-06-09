# Plan: Next.js App Router (store-client) with FSD Structure

> **Status:** ⬜ To Do
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-05-06
> **Last Updated:** 2026-05-06

## Overview

Set up the Next.js storefront application (`apps/store-client`) using the App Router with Feature-Sliced Design (FSD) architecture. This is the foundation for all customer-facing pages and components. The app will be configured with TypeScript, Tailwind CSS, TanStack Query, and the Orval-generated API client for communicating with `store-api`.

## Scope

### In Scope

- Scaffold Next.js App Router project in `apps/store-client`
- Configure TypeScript, ESLint, Prettier for the workspace
- Set up FSD folder structure (`app/`, `widgets/`, `features/`, `entities/`, `shared/`)
- Configure Tailwind CSS with semantic design tokens
- Set up TanStack Query (React Query) provider
- Configure Orval API client generation for store-client
- Set up shared API layer (`shared/api/`) with axios instance
- Create base layout with global providers
- Configure environment variables for API connection

### Out of Scope

- Actual page implementations (HomePage, ProductListPage, etc.) — Phase 2
- shadcn/ui components — TASK-020 (store-admin)
- ProductCard, AddToCart, CartWidget — Phase 2
- Authentication UI — Phase 2
- SEO optimization (sitemap, Schema.org) — Phase 5

## User Stories

1. As a developer, I want a properly structured Next.js storefront so that I can build customer-facing pages following FSD conventions.
2. As a developer, I want auto-generated API hooks from Orval so that I don't write manual fetch calls and get full type safety.
3. As a developer, I want Tailwind configured with semantic tokens so that design changes are centralized and consistent.

## Technical Design

### Project Structure

```
apps/store-client/
├── src/
│   ├── app/                    — App Router (layouts, providers, pages)
│   │   ├── layout.tsx          — Root layout with providers
│   │   ├── page.tsx            — Home page (placeholder)
│   │   ├── globals.css         — Global styles + Tailwind directives
│   │   └── providers.tsx       — TanStack Query, auth context providers
│   ├── widgets/                — Composite UI blocks (future: Header, ProductCard, Footer)
│   ├── features/               — Business interactions (future: AddToCart, Search)
│   ├── entities/               — Domain models & API hooks (future: Product, Category, User)
│   └── shared/                 — Reusable utilities and API client
│       ├── api/
│       │   ├── generated/      — Orval-generated hooks and types
│       │   ├── instance.ts     — Axios instance with base URL
│       │   └── index.ts        — Re-exports
│       ├── ui/                 — Base UI components (future)
│       ├── lib/                — Utility functions
│       └── config/             — App configuration constants
├── public/                     — Static assets
├── .env.local                  — Environment variables
├── .env.example                — Environment template
├── next.config.ts              — Next.js configuration
├── tailwind.config.ts          — Tailwind with semantic tokens
├── postcss.config.mjs          — PostCSS config
├── tsconfig.json               — TypeScript config with path aliases
├── package.json                — Workspace dependencies
└── orval.config.ts             — Orval configuration for API generation
```

### Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/app/*": ["./src/app/*"],
      "@/widgets/*": ["./src/widgets/*"],
      "@/features/*": ["./src/features/*"],
      "@/entities/*": ["./src/entities/*"],
      "@/shared/*": ["./src/shared/*"]
    }
  }
}
```

### Tailwind CSS — Semantic Design Tokens

The `tailwind.config.ts` will define semantic color tokens (not raw hex values):

```typescript
// tailwind.config.ts
const config: Config = {
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        border: "var(--color-border)",
        ring: "var(--color-ring)",
      },
    },
  },
};
```

CSS variables defined in `globals.css`:

```css
@theme {
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-border: #e2e8f0;
  --color-ring: #2563eb;
}
```

### TanStack Query Setup

```tsx
// src/app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Axios Instance (shared/api)

```typescript
// src/shared/api/instance.ts
import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  withCredentials: true, // For cookie-based auth (refresh tokens)
  headers: {
    "Content-Type": "application/json",
  },
});
```

### Orval Configuration

```typescript
// orval.config.ts
import { defineConfig } from "orval";

export default defineConfig({
  storeClient: {
    output: {
      mode: "tags-split",
      target: "src/shared/api/generated",
      schemas: "src/shared/api/generated/model",
      client: "axios-functions",
      mock: false,
      override: {
        mutator: {
          path: "./src/shared/api/instance.ts",
          name: "api",
        },
      },
    },
    input: {
      target: "http://localhost:3001/api-json",
    },
  },
});
```

### Environment Variables

| Variable              | Description          | Default                     |
| --------------------- | -------------------- | --------------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:3001/api` |
| `NEXT_PUBLIC_APP_URL` | Storefront URL       | `http://localhost:3000`     |

### API Contract

The Orval client will consume the OpenAPI spec from `store-api` at `http://localhost:3001/api-json`. Generated hooks will be available at `@/shared/api/generated`.

No manual API endpoints are created in this plan — the API is consumed from `store-api`.

## Tasks

### TASK-017-A: Scaffold Next.js Project

**Type:** feat
**Scope:** store-client
**Complexity:** M
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `apps/store-client/` directory exists with Next.js App Router structure
- [ ] `package.json` configured as workspace with correct name `@store/store-client`
- [ ] `next.config.ts` configured with proper settings
- [ ] `tsconfig.json` with path aliases for FSD layers (`@/app/*`, `@/widgets/*`, etc.)
- [ ] `npm run build -w apps/store-client` succeeds
- [ ] `npm run dev -w apps/store-client` starts the dev server on port 3000
- [ ] Root layout renders with basic HTML structure

**Files to create/modify:**

- `apps/store-client/package.json` — workspace package with Next.js dependencies
- `apps/store-client/next.config.ts` — Next.js configuration
- `apps/store-client/tsconfig.json` — TypeScript with FSD path aliases
- `apps/store-client/.env.local` — environment variables
- `apps/store-client/.env.example` — environment template
- `apps/store-client/src/app/layout.tsx` — root layout
- `apps/store-client/src/app/page.tsx` — placeholder home page
- `apps/store-client/src/app/globals.css` — global styles
- `package.json` — add `store-client` to workspaces (if not already)

---

### TASK-017-B: Configure Tailwind CSS with Semantic Design Tokens

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-A

**Acceptance Criteria:**

- [ ] `tailwind.config.ts` exists with semantic color tokens
- [ ] `postcss.config.mjs` configured for Tailwind
- [ ] `globals.css` contains `@tailwind` directives and CSS custom properties
- [ ] No raw hex values used in any component markup
- [ ] `npm run build -w apps/store-client` succeeds with Tailwind

**Files to create/modify:**

- `apps/store-client/tailwind.config.ts` — Tailwind config with semantic tokens
- `apps/store-client/postcss.config.mjs` — PostCSS configuration
- `apps/store-client/src/app/globals.css` — Tailwind directives + CSS variables

---

### TASK-017-C: Set Up FSD Folder Structure

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-A

**Acceptance Criteria:**

- [ ] `src/widgets/` directory exists with `index.ts` barrel export
- [ ] `src/features/` directory exists with `index.ts` barrel export
- [ ] `src/entities/` directory exists with `index.ts` barrel export
- [ ] `src/shared/api/` directory exists with `instance.ts` and barrel exports
- [ ] `src/shared/lib/` directory exists with barrel export
- [ ] `src/shared/config/` directory exists with barrel export
- [ ] `src/shared/ui/` directory exists with barrel export
- [ ] ESLint import rules enforce FSD layer boundaries (no upward imports)

**Files to create/modify:**

- `apps/store-client/src/widgets/index.ts` — barrel export
- `apps/store-client/src/features/index.ts` — barrel export
- `apps/store-client/src/entities/index.ts` — barrel export
- `apps/store-client/src/shared/api/index.ts` — barrel export
- `apps/store-client/src/shared/api/instance.ts` — axios instance
- `apps/store-client/src/shared/lib/index.ts` — barrel export
- `apps/store-client/src/shared/config/index.ts` — barrel export
- `apps/store-client/src/shared/ui/index.ts` — barrel export
- `apps/store-client/.eslintrc.js` — ESLint config with import rules

---

### TASK-017-D: Configure TanStack Query Provider

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-A

**Acceptance Criteria:**

- [ ] `@tanstack/react-query` and `@tanstack/react-query-devtools` installed
- [ ] `Providers` component wraps app with `QueryClientProvider`
- [ ] QueryClient configured with sensible defaults (staleTime, retry)
- [ ] React Query DevTools available in development mode
- [ ] Root layout uses `Providers` component
- [ ] `npm run build -w apps/store-client` succeeds

**Files to create/modify:**

- `apps/store-client/src/app/providers.tsx` — TanStack Query provider wrapper
- `apps/store-client/src/app/layout.tsx` — integrate Providers
- `apps/store-client/package.json` — add TanStack Query dependencies

---

### TASK-017-E: Configure Orval API Client Generation

**Type:** feat
**Scope:** store-client
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-017-A, TASK-017-C

**Acceptance Criteria:**

- [ ] `orval` and `@orval/core` installed as dev dependencies
- [ ] `orval.config.ts` configured to consume OpenAPI spec from `store-api`
- [ ] `npm run generate:api -w apps/store-client` generates typed hooks in `shared/api/generated/`
- [ ] Generated hooks use the custom axios instance from `shared/api/instance.ts`
- [ ] Generated types are properly exported and importable
- [ ] `npm run typecheck -w apps/store-client` passes after generation

**Files to create/modify:**

- `apps/store-client/orval.config.ts` — Orval configuration
- `apps/store-client/package.json` — add Orval + script
- `apps/store-client/src/shared/api/generated/` — generated output (auto-created)

**NPM script to add:**

```json
"generate:api": "orval --config orval.config.ts"
```

---

### TASK-017-F: Configure ESLint + Import Rules for FSD

**Type:** chore
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-C

**Acceptance Criteria:**

- [ ] `apps/store-client/.eslintrc.js` extends shared config from `packages/eslint-config`
- [ ] Import rules enforce FSD layer boundaries:
  - `app/` can import from `widgets/`, `features/`, `entities/`, `shared/`
  - `widgets/` can import from `features/`, `entities/`, `shared/`
  - `features/` can import from `entities/`, `shared/`
  - `entities/` can import from `shared/`
  - `shared/` cannot import from any other layer
- [ ] `npm run lint -w apps/store-client` passes with zero errors
- [ ] Prettier formatting works on `.ts` and `.tsx` files

**Files to create/modify:**

- `apps/store-client/.eslintrc.js` — ESLint config with FSD import rules
- `packages/eslint-config/index.js` — verify/add Next.js rules if needed

---

### TASK-017-G: Create Root Layout with Global Providers

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-B, TASK-017-D

**Acceptance Criteria:**

- [ ] Root layout (`app/layout.tsx`) includes:
  - HTML lang attribute (`lang="uk"` or `lang="en"`)
  - Meta viewport tag
  - `globals.css` import
  - `Providers` wrapper (TanStack Query)
  - Basic `<header>` placeholder
  - `<main>` content area
  - Basic `<footer>` placeholder
- [ ] Layout is a Server Component (default) with client providers properly separated
- [ ] `npm run build -w apps/store-client` succeeds
- [ ] Dev server renders layout at `http://localhost:3000`

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx` — complete root layout
- `apps/store-client/src/app/page.tsx` — placeholder home page content

---

### TASK-017-H: Verify Full Build Pipeline

**Type:** test
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-017-A, TASK-017-B, TASK-017-C, TASK-017-D, TASK-017-E, TASK-017-F, TASK-017-G

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-client` succeeds
- [ ] `npm run lint -w apps/store-client` passes
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run generate:api -w apps/store-client` succeeds (with store-api running)
- [ ] Dev server starts without errors: `npm run dev -w apps/store-client`
- [ ] Root page renders at `http://localhost:3000`
- [ ] All FSD import rules are enforced (no lint errors for cross-layer imports)

**Files to create/modify:**

- No new files — verification of all previous tasks

## Migration Steps

1. Create `apps/store-client/` directory with `package.json`
2. Install Next.js and core dependencies: `npm install -w apps/store-client`
3. Configure TypeScript with FSD path aliases
4. Set up Tailwind CSS with semantic design tokens
5. Create FSD folder structure with barrel exports
6. Configure TanStack Query provider
7. Set up Orval for API client generation
8. Configure ESLint with FSD import boundary rules
9. Create root layout with global providers
10. Run full verification: build, lint, typecheck

## Risks & Mitigations

| Risk                                                 | Mitigation                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Port 3000 already in use                             | Make port configurable via `PORT` env variable in `next.config.ts`                                             |
| Orval generation fails if store-api is not running   | Document prerequisite: `store-api` must be running for `generate:api` script; add fallback to static spec file |
| FSD import rules too strict during early development | Start with warnings instead of errors; tighten to errors once structure stabilizes                             |
| Tailwind purges needed styles in production          | Use Tailwind v4 with `@theme` directive; ensure all component paths are in `content` config                    |
| Next.js App Router server/client component confusion | Clearly mark `use client` boundaries; keep providers as client components, layout as server component          |
| Axios instance not properly configured for cookies   | Set `withCredentials: true` on axios instance; verify CORS config on backend includes storefront origin        |

## Notes

- The `store-client` app runs on port 3000 by default (configured via `PORT` env or Next.js default)
- The `store-api` backend runs on port 3001 — the `NEXT_PUBLIC_API_URL` env var connects them
- Orval generation requires the backend to be running and serving the OpenAPI spec at `/api-json`
- FSD import rules will be enforced via ESLint's `import/no-restricted-paths` or custom rules
- This plan sets up the scaffold only — actual pages and features come in Phase 2
- The root layout uses Server Component pattern with client-side providers properly isolated
- CSS variables for Tailwind tokens enable easy theme switching in the future (dark mode, brand changes)
