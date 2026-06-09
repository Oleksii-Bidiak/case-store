# Plan: Next.js App Router (store-admin) with FSD Structure

> **Status:** ⬜ To Do
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-05-07
> **Last Updated:** 2026-05-07

## Overview

Set up the Next.js admin panel application (`apps/store-admin`) using the App Router with Feature-Sliced Design (FSD) architecture. This is the foundation for all admin-facing pages and components — product management, order management, user management, and dashboard. The app will be configured with TypeScript, Tailwind CSS (with shadcn/ui), TanStack Query, and the Orval-generated API client for communicating with `store-api`.

This plan mirrors the `store-client` setup (TASK-017) but with admin-specific configurations: different port, shadcn/ui component library, admin-oriented design tokens, and admin-specific metadata.

## Scope

### In Scope

- Scaffold Next.js App Router project in `apps/store-admin`
- Configure TypeScript, ESLint, Prettier for the workspace
- Set up FSD folder structure (`app/`, `widgets/`, `features/`, `entities/`, `shared/`)
- Configure Tailwind CSS with semantic design tokens (admin-oriented)
- Initialize shadcn/ui base components
- Set up TanStack Query (React Query) provider
- Configure Orval API client generation for store-admin
- Set up shared API layer (`shared/api/`) with axios instance
- Create base layout with global providers and admin sidebar scaffold
- Configure environment variables for API connection

### Out of Scope

- Actual admin page implementations (Product CRUD, Order Management, etc.) — Phase 4
- Authentication UI for admin login — Phase 4
- Dashboard metrics and charts — Phase 4
- RBAC implementation — Phase 4
- Image upload functionality — Phase 4

## User Stories

1. As a developer, I want a properly structured Next.js admin panel so that I can build admin-facing pages following FSD conventions.
2. As a developer, I want auto-generated API hooks from Orval so that I don't write manual fetch calls and get full type safety.
3. As a developer, I want Tailwind configured with semantic tokens and shadcn/ui so that admin UI is consistent and accessible.
4. As an admin user, I want a clean, professional admin interface with a sidebar navigation so that I can efficiently manage the store.

## Technical Design

### Project Structure

```
apps/store-admin/
├── src/
│   ├── app/                    — App Router (layouts, providers, pages)
│   │   ├── layout.tsx          — Root layout with providers + admin shell
│   │   ├── page.tsx            — Dashboard placeholder
│   │   ├── globals.css         — Global styles + Tailwind directives + shadcn tokens
│   │   └── providers.tsx       — TanStack Query provider
│   ├── widgets/                — Composite UI blocks (future: Sidebar, Header, DataTable)
│   ├── features/               — Business interactions (future: ProductForm, OrderStatusUpdate)
│   ├── entities/               — Domain models & API hooks (future: Product, Order, User)
│   └── shared/                 — Reusable utilities and API client
│       ├── api/
│       │   ├── generated/      — Orval-generated hooks and types
│       │   ├── instance.ts     — Axios instance with base URL
│       │   └── index.ts        — Re-exports
│       ├── ui/                 — shadcn/ui base components (Button, Input, Table, etc.)
│       ├── lib/                — Utility functions
│       └── config/             — App configuration constants
├── public/                     — Static assets
├── .env.local                  — Environment variables
├── .env.example                — Environment template
├── next.config.ts              — Next.js configuration
├── postcss.config.mjs          — PostCSS config
├── tsconfig.json               — TypeScript config with path aliases
├── package.json                — Workspace dependencies
├── orval.config.ts             — Orval configuration for API generation
└── components.json             — shadcn/ui configuration
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

### Port Configuration

The admin panel runs on port **3002** to avoid conflicts with:

- `store-client` on port 3000
- `store-api` on port 3001

Configured via `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  },
};

export default nextConfig;
```

Dev script: `"dev": "next dev -p 3002"`

### Tailwind CSS — Semantic Design Tokens (Admin)

The admin panel uses Tailwind v4 with CSS-based `@theme` configuration. Design tokens are admin-oriented with a more neutral/professional palette suitable for data-heavy interfaces.

CSS variables in `globals.css`:

```css
:root {
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-primary: #0f172a;
  --color-primary-foreground: #ffffff;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-accent: #f1f5f9;
  --color-accent-foreground: #0f172a;
  --color-destructive: #ef4444;
  --color-destructive-foreground: #ffffff;
  --color-card: #ffffff;
  --color-card-foreground: #0f172a;
  --color-popover: #ffffff;
  --color-popover-foreground: #0f172a;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #0f172a;
  --radius: 0.5rem;
}
```

### shadcn/ui Configuration

shadcn/ui will be initialized with the `new-york` style variant. The `components.json` config:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/lib/hooks"
  }
}
```

Base components to install initially:

- `button` — Primary action buttons
- `input` — Form inputs
- `label` — Form labels
- `table` — Data tables for product/order listings
- `dialog` — Modal dialogs for CRUD forms
- `dropdown-menu` — Action menus
- `sidebar` — Admin navigation sidebar
- `badge` — Status indicators (order status, etc.)
- `select` — Dropdown selects
- `textarea` — Multi-line text inputs
- `toast` — Notification system
- `separator` — Visual dividers
- `sheet` — Slide-out panels

### TanStack Query Setup

Same pattern as store-client:

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

Same pattern as store-client:

```typescript
// src/shared/api/instance.ts
import Axios, { AxiosError, AxiosRequestConfig } from "axios";

export const api = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = Axios.CancelToken.source();
  const promise = api({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-expect-error cancel is not part of standard Promise
  promise.cancel = () => source.cancel("Query was cancelled");

  return promise;
};

export type ErrorType<Error> = AxiosError<Error>;
export type BodyType<BodyData> = BodyData;
```

### Orval Configuration

Same pattern as store-client but with admin-specific output:

```typescript
// orval.config.ts
import { defineConfig } from "orval";

export default defineConfig({
  storeAdmin: {
    input: {
      target: "http://localhost:3001/api-json",
    },
    output: {
      mode: "tags-split",
      target: "src/shared/api/generated/endpoints.ts",
      schemas: "src/shared/api/generated/models",
      client: "react-query",
      httpClient: "axios",
      mock: false,
      clean: true,
      override: {
        mutator: {
          path: "./src/shared/api/instance.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "prettier --write",
    },
  },
});
```

### Environment Variables

| Variable                | Description          | Default                     |
| ----------------------- | -------------------- | --------------------------- |
| `NEXT_PUBLIC_API_URL`   | Backend API base URL | `http://localhost:3001/api` |
| `NEXT_PUBLIC_APP_URL`   | Storefront URL       | `http://localhost:3000`     |
| `NEXT_PUBLIC_ADMIN_URL` | Admin panel URL      | `http://localhost:3002`     |

### Root Layout — Admin Shell

The admin layout includes a sidebar navigation structure (placeholder for Phase 4):

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Admin Panel — Mobile Accessories Store",
  description: "Admin panel for managing products, orders, and users.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground">
        <Providers>
          <div className="flex min-h-screen">
            {/* Sidebar placeholder — full implementation in Phase 4 */}
            <aside className="w-64 border-r border-border bg-card p-4">
              <p className="text-sm font-semibold text-muted-foreground">
                Admin Panel
              </p>
              {/* Navigation links will be added in Phase 4 */}
            </aside>
            <div className="flex-1">
              <header className="border-b border-border px-6 py-4">
                <h1 className="text-lg font-semibold">Dashboard</h1>
              </header>
              <main className="p-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
```

### API Contract

The Orval client will consume the OpenAPI spec from `store-api` at `http://localhost:3001/api-json`. Generated hooks will be available at `@/shared/api/generated`.

No manual API endpoints are created in this plan — the API is consumed from `store-api`.

## Tasks

### TASK-018-A: Scaffold Next.js Admin Project

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `apps/store-admin/` directory exists with Next.js App Router structure
- [ ] `package.json` configured as workspace with name `@store/store-admin`
- [ ] `next.config.ts` configured with proper settings
- [ ] `tsconfig.json` with path aliases for FSD layers (`@/app/*`, `@/widgets/*`, etc.)
- [ ] `tsconfig.json` extends `@store/typescript-config/next`
- [ ] `npm run build -w apps/store-admin` succeeds
- [ ] `npm run dev -w apps/store-admin` starts the dev server on port 3002
- [ ] Root layout renders with basic HTML structure
- [ ] Root package.json workspaces already includes `apps/*` (no change needed)

**Files to create/modify:**

- `apps/store-admin/package.json` — workspace package with Next.js dependencies
- `apps/store-admin/next.config.ts` — Next.js configuration
- `apps/store-admin/tsconfig.json` — TypeScript with FSD path aliases
- `apps/store-admin/.env.local` — environment variables
- `apps/store-admin/.env.example` — environment template
- `apps/store-admin/src/app/layout.tsx` — root layout with admin shell
- `apps/store-admin/src/app/page.tsx` — placeholder dashboard page
- `apps/store-admin/src/app/globals.css` — global styles (minimal, expanded in TASK-018-B)

---

### TASK-018-B: Configure Tailwind CSS with Semantic Design Tokens

**Type:** feat
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-A

**Acceptance Criteria:**

- [ ] `postcss.config.mjs` configured for Tailwind with `@tailwindcss/postcss`
- [ ] `globals.css` contains `@import 'tailwindcss'` directive
- [ ] `globals.css` contains semantic CSS custom properties for admin theme
- [ ] `globals.css` contains `@theme inline` block mapping CSS vars to Tailwind utilities
- [ ] No raw hex values used in any component markup
- [ ] `npm run build -w apps/store-admin` succeeds with Tailwind
- [ ] Dark mode support via `@media (prefers-color-scheme: dark)`

**Files to create/modify:**

- `apps/store-admin/postcss.config.mjs` — PostCSS configuration
- `apps/store-admin/src/app/globals.css` — Tailwind directives + CSS variables + @theme block

---

### TASK-018-C: Initialize shadcn/ui Base Components

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-018-B

**Acceptance Criteria:**

- [ ] `components.json` exists with shadcn/ui configuration
- [ ] `@/shared/ui/` directory contains shadcn/ui components
- [ ] `@/shared/lib/utils.ts` exists with `cn()` utility function (clsx + tailwind-merge)
- [ ] Base components installed: button, input, label, table, dialog, dropdown-menu, badge, select, textarea, toast, separator, sheet
- [ ] Components use semantic design tokens (not raw hex values)
- [ ] `npm run build -w apps/store-admin` succeeds after shadcn/ui installation
- [ ] Components are accessible (keyboard navigation, ARIA attributes)

**Files to create/modify:**

- `apps/store-admin/components.json` — shadcn/ui configuration
- `apps/store-admin/src/shared/ui/` — shadcn/ui component files (auto-generated by CLI)
- `apps/store-admin/src/shared/lib/utils.ts` — `cn()` utility function
- `apps/store-admin/package.json` — add `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `sonner` dependencies

**Dependencies to install:**

```
clsx, tailwind-merge, class-variance-authority, lucide-react, sonner, @radix-ui/react-* (via shadcn CLI)
```

---

### TASK-018-D: Set Up FSD Folder Structure

**Type:** feat
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-A

**Acceptance Criteria:**

- [ ] `src/widgets/` directory exists with `index.ts` barrel export
- [ ] `src/features/` directory exists with `index.ts` barrel export
- [ ] `src/entities/` directory exists with `index.ts` barrel export
- [ ] `src/shared/api/` directory exists with `instance.ts` and barrel exports
- [ ] `src/shared/lib/` directory exists with barrel export
- [ ] `src/shared/config/` directory exists with barrel export
- [ ] `src/shared/ui/` directory exists with barrel export (populated by TASK-018-C)
- [ ] ESLint import rules enforce FSD layer boundaries (no upward imports)

**Files to create/modify:**

- `apps/store-admin/src/widgets/index.ts` — barrel export
- `apps/store-admin/src/features/index.ts` — barrel export
- `apps/store-admin/src/entities/index.ts` — barrel export
- `apps/store-admin/src/shared/api/index.ts` — barrel export
- `apps/store-admin/src/shared/api/instance.ts` — axios instance with customInstance for Orval
- `apps/store-admin/src/shared/lib/index.ts` — barrel export
- `apps/store-admin/src/shared/config/index.ts` — barrel export
- `apps/store-admin/src/shared/ui/index.ts` — barrel export

---

### TASK-018-E: Configure TanStack Query Provider

**Type:** feat
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-A

**Acceptance Criteria:**

- [ ] `@tanstack/react-query` and `@tanstack/react-query-devtools` installed
- [ ] `Providers` component wraps app with `QueryClientProvider`
- [ ] QueryClient configured with sensible defaults (staleTime, retry)
- [ ] React Query DevTools available in development mode
- [ ] Root layout uses `Providers` component
- [ ] `npm run build -w apps/store-admin` succeeds

**Files to create/modify:**

- `apps/store-admin/src/app/providers.tsx` — TanStack Query provider wrapper
- `apps/store-admin/src/app/layout.tsx` — integrate Providers
- `apps/store-admin/package.json` — add TanStack Query dependencies

---

### TASK-018-F: Configure Orval API Client Generation

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-018-A, TASK-018-D

**Acceptance Criteria:**

- [ ] `orval` installed as dev dependency
- [ ] `orval.config.ts` configured to consume OpenAPI spec from `store-api`
- [ ] `npm run generate:api -w apps/store-admin` generates typed hooks in `shared/api/generated/`
- [ ] Generated hooks use the custom axios instance from `shared/api/instance.ts`
- [ ] Generated types are properly exported and importable
- [ ] `npm run typecheck -w apps/store-admin` passes after generation

**Files to create/modify:**

- `apps/store-admin/orval.config.ts` — Orval configuration
- `apps/store-admin/package.json` — add Orval + `generate:api` script
- `apps/store-admin/src/shared/api/generated/` — generated output (auto-created)

**NPM script to add:**

```json
"generate:api": "orval --config orval.config.ts"
```

---

### TASK-018-G: Configure ESLint + Import Rules for FSD

**Type:** chore
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/eslint.config.mjs` extends shared config from `packages/eslint-config`
- [ ] Import rules enforce FSD layer boundaries:
  - `app/` can import from `widgets/`, `features/`, `entities/`, `shared/`
  - `widgets/` can import from `features/`, `entities/`, `shared/`
  - `features/` can import from `entities/`, `shared/`
  - `entities/` can import from `shared/`
  - `shared/` cannot import from any other layer
- [ ] `npm run lint -w apps/store-admin` passes with zero errors
- [ ] Prettier formatting works on `.ts` and `.tsx` files
- [ ] ESLint config mirrors the store-client pattern exactly

**Files to create/modify:**

- `apps/store-admin/eslint.config.mjs` — ESLint config with FSD import rules (copy pattern from store-client)

---

### TASK-018-H: Create Root Layout with Admin Shell

**Type:** feat
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-B, TASK-018-C, TASK-018-E

**Acceptance Criteria:**

- [ ] Root layout (`app/layout.tsx`) includes:
  - HTML lang attribute (`lang="en"`)
  - Meta viewport tag
  - `globals.css` import
  - `Providers` wrapper (TanStack Query)
  - Admin sidebar placeholder (`<aside>`) with border and background
  - Admin header placeholder with title
  - `<main>` content area with proper padding
- [ ] Layout uses flex layout: sidebar on left, content on right
- [ ] Layout is a Server Component (default) with client providers properly separated
- [ ] `npm run build -w apps/store-admin` succeeds
- [ ] Dev server renders layout at `http://localhost:3002`
- [ ] Metadata includes admin-specific title and description

**Files to create/modify:**

- `apps/store-admin/src/app/layout.tsx` — complete root layout with admin shell
- `apps/store-admin/src/app/page.tsx` — placeholder dashboard page content

---

### TASK-018-I: Verify Full Build Pipeline

**Type:** test
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-018-A, TASK-018-B, TASK-018-C, TASK-018-D, TASK-018-E, TASK-018-F, TASK-018-G, TASK-018-H

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-admin` succeeds
- [ ] `npm run lint -w apps/store-admin` passes
- [ ] `npm run typecheck -w apps/store-admin` passes
- [ ] `npm run generate:api -w apps/store-admin` succeeds (with store-api running)
- [ ] Dev server starts without errors: `npm run dev -w apps/store-admin`
- [ ] Root page renders at `http://localhost:3002`
- [ ] All FSD import rules are enforced (no lint errors for cross-layer imports)
- [ ] shadcn/ui components render correctly in the browser
- [ ] TanStack Query DevTools accessible in development mode

**Files to create/modify:**

- No new files — verification of all previous tasks

## Migration Steps

1. Create `apps/store-admin/` directory with `package.json`
2. Install Next.js and core dependencies: `npm install -w apps/store-admin`
3. Configure TypeScript with FSD path aliases (extending shared config)
4. Set up Tailwind CSS with semantic design tokens (admin-oriented palette)
5. Initialize shadcn/ui with `npx shadcn@latest init` and install base components
6. Create FSD folder structure with barrel exports
7. Configure TanStack Query provider
8. Set up Orval for API client generation
9. Configure ESLint with FSD import boundary rules (mirror store-client pattern)
10. Create root layout with admin shell (sidebar + header + main)
11. Run full verification: build, lint, typecheck

## Risks & Mitigations

| Risk                                                      | Mitigation                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Port 3002 already in use                                  | Make port configurable via `-p` flag in dev script; document port convention                                           |
| Orval generation fails if store-api is not running        | Document prerequisite: `store-api` must be running for `generate:api` script; fallback to static `openapi.json` file   |
| shadcn/ui CLI fails with Tailwind v4                      | shadcn/ui supports Tailwind v4; if issues arise, use manual component installation from shadcn source                  |
| FSD import rules too strict during early development      | Start with warnings instead of errors; tighten to errors once structure stabilizes                                     |
| Next.js App Router server/client component confusion      | Clearly mark `use client` boundaries; keep providers as client components, layout as server component                  |
| Axios instance not properly configured for cookies        | Set `withCredentials: true` on axios instance; verify CORS config on backend includes admin origin                     |
| shadcn/ui components conflict with existing CSS variables | shadcn/ui is designed to use CSS variables; ensure `globals.css` includes all required shadcn tokens                   |
| Duplicate work with store-client setup                    | Reuse patterns from store-client; copy ESLint config, Orval config, and axios instance with admin-specific adjustments |

## Notes

- The `store-admin` app runs on port **3002** by default (configured via `-p 3002` in dev script)
- The `store-api` backend runs on port 3001 — the `NEXT_PUBLIC_API_URL` env var connects them
- Orval generation requires the backend to be running and serving the OpenAPI spec at `/api-json`
- FSD import rules will be enforced via ESLint's `no-restricted-imports` (same pattern as store-client)
- This plan sets up the scaffold only — actual admin pages and features come in Phase 4
- shadcn/ui components are copied into the project (not installed as a library), giving full control over customization
- The admin sidebar is a placeholder in this plan — full navigation implementation is deferred to Phase 4
- CSS variables for Tailwind tokens enable easy theme switching and dark mode support
- The admin panel uses the same `@store/typescript-config/next` shared config as store-client
- The `components.json` shadcn/ui config points `@/shared/ui` as the components directory to align with FSD
