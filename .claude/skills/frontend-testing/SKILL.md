---
name: frontend-testing
description: Test React/Next.js frontends. Jest with two projects in store-client (node pure-logic + jsdom RTL/MSW component tests) and a jsdom RTL/MSW harness in store-admin. Playwright e2e scaffold at repo root.
---

## What I Do

I provide the testing patterns for `apps/store-client` and `apps/store-admin`. Both
apps have a **live RTL + MSW component-test harness** (shipped via TASK-105); this
skill documents how to use it, not how to build it.

## Current Stack (in use)

| Tool                                              | Purpose                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Jest**                                          | Test runner (per-app configs)                                                     |
| **ts-jest**                                       | Transform for the store-client `unit` project (node env, `*.test.ts`)             |
| **@swc/jest**                                     | Fast JSX transform for jsdom component projects (`*.test.tsx`)                    |
| **React Testing Library + jest-dom + user-event** | Component testing                                                                 |
| **MSW**                                           | API mocking (never mock fetch/axios directly)                                     |
| **Playwright**                                    | E2E scaffold at repo root (`e2e/`, `npm run test:e2e:pw`) — needs a running stack |

### Harness layout

- `apps/store-client/jest.config.cjs` — **two projects**: `unit` (node, ts-jest,
  `*.test.ts` pure logic: zod schemas, formatters, builders) and `component`
  (jsdom, @swc/jest, `*.test.tsx`, RTL + MSW). Both run via
  `npm run test -w apps/store-client`.
- `apps/store-admin/jest.config.cjs` — single jsdom `component` project, mirrors
  store-client's component project.
- `apps/*/src/shared/test/` — `setup.ts` (jest-dom + MSW server lifecycle),
  `msw-server.ts`, `msw-handlers.ts` (shared handlers + entity factories like
  `makeUser`), `render.tsx` (wrapper with QueryClientProvider).
- Both configs pin `react`/`react-dom` to the app's own copy in
  `moduleNameMapper` — multiple React copies across the workspace otherwise cause
  a null-dispatcher crash in hooks. Don't remove those mappings.
- jsdom needs `testEnvironmentOptions: { customExportConditions: [""] }` so
  `msw/node` resolves — don't remove it either.

> ⚠️ **Known flakiness:** the full store-client suite can time out heavy MSW
> suites under parallel load. Before debugging a "broken" test, re-run with
> `--runInBand` — serial runs are the ground truth.

## Writing Tests

### Component test (RTL + MSW)

```tsx
// src/features/add-to-cart/ui/add-to-cart-button.test.tsx
import { render, screen } from "@/shared/test/render"; // wraps QueryClientProvider
import userEvent from "@testing-library/user-event";
import { server } from "@/shared/test/msw-server";
import { http, HttpResponse } from "msw";
import { AddToCartButton } from "./add-to-cart-button";

it("shows error state on API failure", async () => {
  server.use(
    http.post("*/cart/items", () =>
      HttpResponse.json(
        { error: "Cart full", statusCode: 400 },
        { status: 400 },
      ),
    ),
  );
  render(<AddToCartButton productId="1" />);
  await userEvent.click(screen.getByRole("button"));
  // assert the visible error UI, not internal state
});
```

Override handlers per-test with `server.use(...)`; the default happy-path
handlers live in `msw-handlers.ts` — extend the factories there instead of
inlining big fixtures.

### Pure-logic test (unit project, `*.test.ts`)

```ts
// src/features/checkout/model/checkout-schema.test.ts
import { checkoutSchema } from "./checkout-schema";

it("rejects invalid email", () => {
  const result = checkoutSchema.safeParse({ ...valid, email: "not-an-email" });
  expect(result.success).toBe(false);
  expect(result.error.issues[0].path).toContain("email");
});
```

## Test Commands

```bash
npm run test -w apps/store-client          # unit + component projects
npm run test -w apps/store-admin           # component project
npx jest -c apps/store-client/jest.config.cjs --runInBand   # flake check
npx jest -c apps/store-client/jest.config.cjs src/path/to/file.test.tsx
npm run test:e2e:pw                        # Playwright (needs DB + booted apps)
```

## Rules

- ALWAYS test user behavior, not implementation details — `getByRole`/`getByText`
  over `getByTestId`; never assert internal component state.
- ALWAYS mock the API with MSW handlers — never mock fetch/axios or the
  generated hooks directly.
- ALWAYS place test files next to the source: `foo.ts` → `foo.test.ts`,
  `foo.tsx` → `foo.test.tsx` (the extension picks the Jest project).
- ALWAYS test loading, error, and empty states for data-driven components.
- ALWAYS use `jest.fn()` (this repo runs Jest, not Vitest — there is no `vi`).
- Forms seeded from async data follow `docs/conventions/forms.md` — test the
  sync-guard behavior (reset keyed to entity id, no clobber of in-progress edits).
- Radix Select under jsdom drops programmatically-reset values (jsdom-only
  artifact) — assert Rule-2b resets through a plain input instead.
