# Plan: Mail Reliability — Transactional Outbox + Retry Worker

> **Status:** ⬜ Not started
> **Phase:** Tier 4 — Commerce, discovery & reliability · **Wave 2 (Group B)**
> **Parent task:** TASK-103
> **Created:** 2026-06-30
> **Last Updated:** 2026-06-30

## Overview

Today `MailService.sendOrderConfirmation` is **fire-and-forget, awaited inside
order creation** (`order.service.ts:155`): an SMTP hiccup either delays the order
response or silently drops the email. This plan replaces that with the
**transactional outbox** pattern — order creation writes a `MailOutbox` row in the
**same transaction** as the order, and a background **retry worker** (cron, modeled
on `RefreshTokenCleanupService`) dispatches pending rows with exponential backoff.
Mail is decoupled from the request path and never lost on transient failure.

## Scope

### In Scope

- `MailOutbox` Prisma model (+ migration `add_mail_outbox`).
- Order creation enqueues an outbox row in its `$transaction` (no inline send).
- `MailOutboxWorker` — cron-driven dispatch with attempts/backoff, modeled on
  `RefreshTokenCleanupService` (SchedulerRegistry + CronJob, config-driven).
- `MailService` keeps the actual rendering/SMTP send; the worker calls it.

### Out of Scope

- A general event bus / message queue (DB-backed outbox only; Redis/BullMQ is a
  later option if volume demands).
- New email types beyond what exists (order confirmation today; the outbox is
  generic via a `type` + JSON payload so registration/other mails can be added
  later without schema change).
- Abandoned-cart emails (TASK-049, parked) — but this outbox is the infra it reuses.

## User Stories

1. As a customer, my order is created instantly even if SMTP is slow/down, and I
   still reliably receive the confirmation once mail recovers.
2. As an operator, transient SMTP failures retry automatically with backoff, and
   permanently-failed rows are visible (status + lastError) for inspection.

## Technical Design

### Data Model

```prisma
enum MailOutboxStatus {
  PENDING
  SENT
  FAILED   // terminal: max attempts exhausted
}

model MailOutbox {
  id            String           @id @default(uuid())
  type          String                                  // e.g. "order-confirmation"
  recipient     String
  payload       Json                                    // typed per `type`; rendered at send time
  status        MailOutboxStatus @default(PENDING)
  attempts      Int              @default(0)
  maxAttempts   Int              @default(5) @map("max_attempts")
  lastError     String?          @map("last_error")
  nextAttemptAt DateTime         @default(now()) @map("next_attempt_at")
  createdAt     DateTime         @default(now()) @map("created_at")
  sentAt        DateTime?        @map("sent_at")

  @@index([status, nextAttemptAt])
  @@map("mail_outbox")
}
```

### Backend (NestJS — Clean Architecture)

**`MailOutboxRepository`** — `enqueue(data, tx)` (must accept the order's
transaction client so the row is atomic with the order), `claimDue(now, limit)`
(status PENDING && nextAttemptAt <= now, oldest first), `markSent(id)`,
`markRetry(id, error, nextAttemptAt, attempts)`, `markFailed(id, error)`.

**`MailOutboxService`**:

- `enqueueOrderConfirmation(params, tx)` — serialize the confirmation payload
  (the same data `MailService.toTemplateOrder` needs) into an outbox row.
- `dispatchDue(): Promise<{ sent: number; retried: number; failed: number }>` —
  claim due rows, for each call `MailService` to render+send; on success
  `markSent`; on error increment attempts, compute backoff
  (`base * 2^attempts`, capped), `markRetry` until `attempts >= maxAttempts`
  then `markFailed`. Public so it's unit-testable without the scheduler.

**`MailOutboxWorker`** (mirror `RefreshTokenCleanupService`): `OnModuleInit`
registers a `CronJob` via `SchedulerRegistry` with a config-driven schedule
(`MAIL_OUTBOX_CRON`, default every minute `* * * * *`); each tick calls
`dispatchDue()`. Lives in the (global) `MailModule` or a new `MailOutboxModule`
imported by `OrderModule`.

**Refactor `MailService`:** extract the render-from-payload path so the worker can
render from a stored payload (not a live `OrderEntity`). Keep the disabled→no-op
behavior: when `MAIL_ENABLED !== "true"`, `dispatchDue` still drains rows by
marking them sent with a logged no-op (so the table doesn't grow in dev/CI).

**Order integration:** in `OrderService.createOrder`, replace the inline
`await this.mailService.sendOrderConfirmation(...)` with
`this.mailOutbox.enqueueOrderConfirmation(payload, tx)` **inside** the existing
order `$transaction`. The HTTP response no longer depends on SMTP.

### API Contract

No new public endpoints (internal infra). Optional (out of scope here): an admin
read-only outbox view — deferred.

## Tasks

### TASK-103-A: Prisma `MailOutbox` (+ migration)

**Type:** feat · **Scope:** store-api · **Complexity:** S · **TDD:** No
**Acceptance:** model + enum + `@@index([status, nextAttemptAt])`; migration
`add_mail_outbox`; `prisma generate` clean.

### TASK-103-B: `MailOutboxRepository`

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** Yes (repo spec)
**Depends on:** 103-A. **Acceptance:** tx-aware `enqueue`; `claimDue` ordering +
due-filter; status transitions; PrismaService injected.

### TASK-103-C: `MailOutboxService.dispatchDue` (backoff state machine)

**Type:** feat · **Scope:** store-api · **Complexity:** L · **TDD:** **Yes**
**Depends on:** 103-B. **Acceptance:** Red→Green→Refactor for success→SENT,
transient→retry with growing backoff, exhausted→FAILED, disabled-mail no-op drain;
deterministic via injected clock; ≥ 10 spec cases.

### TASK-103-D: `MailService` payload refactor + render-from-payload

**Type:** refactor · **Scope:** store-api · **Complexity:** M · **TDD:** Yes
**Depends on:** 103-C. **Acceptance:** render path takes a stored payload; existing
order-confirmation template + `mail.service.spec.ts` stay green.

### TASK-103-E: `MailOutboxWorker` (cron) + module wiring

**Type:** feat · **Scope:** store-api · **Complexity:** S · **TDD:** No
**Depends on:** 103-C. **Acceptance:** SchedulerRegistry CronJob (config cron),
registered in module + `app.module.ts`; structured Pino logs (`mailOutbox.dispatch`).

### TASK-103-F: Order enqueue integration

**Type:** refactor · **Scope:** store-api · **Complexity:** M · **TDD:** Yes
**Depends on:** 103-B, 103-D. **Acceptance:** `createOrder` enqueues in-transaction
instead of inline send; order e2e still green; new test asserts an outbox row is
written on order creation and **no** synchronous SMTP call happens.

## Execution Order

`103-A → 103-B → 103-C → 103-D → { 103-E, 103-F }`

(Backend-only — no Orval regen, no frontend.)

## Verification Gate

- `npm run test -w apps/store-api` (outbox repo/service/worker specs + mail spec)
- `npm run test:e2e -w apps/store-api -- --testPathPattern "order" --forceExit`
  (order creation still 201; outbox row asserted)
- `npm run lint && npm run typecheck && npm run build -w apps/store-api`

## Risks & Mitigations

| Risk                             | Mitigation                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Outbox row not atomic with order | `enqueue` takes the order's `tx` client; written in the same `$transaction`.                                             |
| Duplicate sends (worker overlap) | `claimDue` + immediate status flip; single-instance cron for MVP (note multi-instance needs row locking — out of scope). |
| Mail disabled lets table grow    | Disabled path drains rows as logged no-op SENT.                                                                          |
| Poison message retries forever   | `maxAttempts` → terminal `FAILED` with `lastError`.                                                                      |
| Clock-based flakiness in tests   | Inject a clock/now into the service (no `new Date()` in branch logic).                                                   |

## Notes

- Worker mirrors `RefreshTokenCleanupService` (`auth/refresh-token-cleanup.service.ts`)
  — same SchedulerRegistry + config-cron + public-method-for-tests shape.
- Generic `type` + JSON `payload` so future mails (registration, abandoned cart)
  reuse the outbox without a migration.
- **Wave-2 migration is created schema-first on `develop`** before parallel work.
- Related: [[090-coupons-discounts]], [[091-wishlist-favorites]].
