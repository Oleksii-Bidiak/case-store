# Plan 094 — Sentry error tracking (backend + frontend) — TASK-048

> **Wave 3 / Stream B.** Wires `@sentry/nestjs` into the NestJS API and `@sentry/nextjs` into
> both Next.js apps, funnelling unhandled errors + the existing Pino error path to Sentry.
> **Degrades to a no-op when no DSN is configured** — the whole feature is inert in dev/CI unless
> `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set, so nothing breaks locally and no live account is
> required to land the code. Fulfils requirements.md §6 (Frontend Error Tracking + backend errors).

## Goal

1. **Backend (`store-api`):** capture unhandled exceptions and errors flowing through the global
   `HttpExceptionFilter`, tagged with request context, without double-logging (Pino stays the
   structured-log source of truth; Sentry is the alerting/aggregation sink for 5xx + unhandled).
2. **Frontend (`store-client` + `store-admin`):** capture client + server component/render errors
   and unhandled rejections; wrap the Next config; add the app-router error boundary hook.
3. **Config-gated:** if the DSN env var is absent, `Sentry.init` is skipped → zero runtime effect.

Non-goals: performance tracing/session-replay tuning, release-health/source-map upload pipeline
in CI (leave `tracesSampleRate` low/0 and document source-map upload as a follow-up), custom
breadcrumb enrichment beyond defaults.

## ⚠️ Next.js caveat

`apps/store-client/AGENTS.md` warns this is a **non-standard Next.js** with breaking changes vs
training data. Before writing any Sentry wiring for the frontends, the agent MUST read the
installed version's docs under `node_modules/next/dist/docs/` (instrumentation, error handling,
config) **and** the `@sentry/nextjs` setup for that Next major. Do not assume the classic
`sentry.client/server/edge.config.ts` layout — confirm whether this version uses
`instrumentation.ts` / `instrumentation-client.ts` and follow that.

## Architecture touchpoints

| App                        | File(s)                                                                                                  | Change                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| store-api                  | `src/instrument.ts` (new)                                                                                | `Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: !!DSN, tracesSampleRate, environment })`; imported **first** in `main.ts` (before `AppModule`) |
| store-api                  | `main.ts`                                                                                                | `import './instrument';` at the very top; register `SentryGlobalFilter`/capture in the exception path                                               |
| store-api                  | `app.module.ts`                                                                                          | `SentryModule.forRoot()` (owns this import — coordinate with Stream C? no: Stream C is test-only)                                                   |
| store-api                  | `HttpExceptionFilter`                                                                                    | forward 5xx / non-HTTP exceptions to `Sentry.captureException` (guarded; still returns the same envelope)                                           |
| store-api                  | `config/env.validation.ts`                                                                               | optional `SENTRY_DSN` (+ `SENTRY_ENVIRONMENT?`, `SENTRY_TRACES_SAMPLE_RATE?`) — all optional                                                        |
| store-api                  | `.env.example`                                                                                           | document the new optional vars                                                                                                                      |
| store-client / store-admin | `next.config.ts`                                                                                         | wrap export with `withSentryConfig(...)` (keep existing `images`/`env` config intact)                                                               |
| store-client / store-admin | instrumentation per the installed Next version                                                           | client + server init, DSN-gated                                                                                                                     |
| store-client / store-admin | app-router `global-error.tsx` + `onRequestError`/`onRouterTransitionStart` hooks as the version requires | report render/RSC errors                                                                                                                            |
| store-client / store-admin | `.env.example`                                                                                           | `NEXT_PUBLIC_SENTRY_DSN` (+ optional org/project for source maps)                                                                                   |

## Sub-tasks

- **TASK-048-A** — Backend deps + `instrument.ts`: add `@sentry/nestjs` (+ `@sentry/profiling-node`
  only if trivially compatible; else skip). `Sentry.init` reads `SENTRY_DSN`; `enabled` false when
  absent; `environment` from `NODE_ENV`; `tracesSampleRate` from env (default 0). Import at the top
  of `main.ts`.
- **TASK-048-B** — Backend capture wiring: register Sentry with Nest (`SentryModule.forRoot()` in
  `app.module.ts`) and add a guarded `Sentry.captureException` in `HttpExceptionFilter` for
  unhandled/5xx (do NOT capture 4xx validation errors — noise). Unit spec: filter still returns the
  envelope; `captureException` called for a 500, not for a 400; no-op when DSN unset.
- **TASK-048-C** — env validation + `.env.example`: `SENTRY_DSN` optional string; app boots fine
  without it (assert in an env-validation spec).
- **TASK-048-D** — Frontend (`store-client`): install `@sentry/nextjs`, wrap `next.config.ts` with
  `withSentryConfig` (preserve `images.remotePatterns` + `env`), add version-correct instrumentation
  - `global-error.tsx`, DSN-gated. Keep the build green with no DSN.
- **TASK-048-E** — Frontend (`store-admin`): same wiring as store-client.
- **TASK-048-F** — Verify no Orval/API-contract impact (this stream adds no endpoints); no
  `swagger:export`/`generate:api` needed. Confirm generated files untouched.
- **TASK-048-G** — Full stream gate (below).

## Acceptance criteria

- With **no** DSN set: all three apps build, boot, and pass tests exactly as before (Sentry inert).
- With a DSN set (manual QA): an unhandled backend error and a thrown frontend render error both
  appear in Sentry with environment + request/route context.
- `HttpExceptionFilter` still returns the standard `{ error, message, statusCode }` envelope; 4xx
  validation errors are NOT sent to Sentry.
- `build`/`lint`/`typecheck` green in all three workspaces; unit tests green; no Orval drift.

## Verification

- `npm run test -w apps/store-api` (exception-filter capture spec, env-validation spec).
- `npm run build && npm run typecheck` across all workspaces (Sentry config-wrap must not break the
  Next build — the most likely failure point given the non-standard Next version).
- **Pending manual QA (needs a DSN + running stack):** trigger a deliberate 500 on the API and a
  thrown error on a storefront/admin page; confirm both land in the Sentry project with correct
  `environment` tags. Source-map upload in CI is a documented follow-up, not part of this task.

## Wave-3 integration notes

- No Prisma migration, no new API endpoints → **no migration mutex, no Orval regen**.
- Shared-file collision with Stream A (091) and Stream C (160): **none**. This stream owns
  `main.ts` / `instrument.ts` / `HttpExceptionFilter` / both `next.config.ts` / instrumentation.
  Stream A touches `product-image`/`storage`/`ProductCardImage`; Stream C is backend-test-only.
  The one `app.module.ts` edit (SentryModule import) is this stream's alone in Wave 3.
