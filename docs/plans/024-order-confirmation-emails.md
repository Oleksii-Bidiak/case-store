# Plan 024: Order Confirmation Emails

> **Status:** To Do
> **Phase:** Phase 3 — Checkout & Orders
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11
> **BACKLOG task:** TASK-037

## Overview

When a customer places an order (`POST /api/orders`), the backend should automatically send
them a transactional confirmation email containing the order number, a line-item summary with
snapshotted prices, totals, and the shipping address. This closes the Phase 3 exit criterion
"User can complete a purchase, receive order confirmation" (docs/roadmap.md).

The implementation is **backend-only** — no new public API endpoints are added, no frontend
changes are required, and **no Orval regeneration is needed**.

The email dispatch is introduced as a post-create side-effect inside `OrderService.createOrder`.
The order record itself is the source of truth. If the email fails for any reason (SMTP
unavailable, misconfigured, network timeout), the order is **not** rolled back — the error is
caught, logged at `error` level, and the service continues to return the created `OrderEntity`.

A dedicated `MailModule` is created at `apps/store-api/src/mail/`, following the same
self-contained NestJS module pattern used throughout this project. The mail send logic is
backed by `nodemailer`. The email template is a **pure TypeScript function** — no template
engine dependency is pulled in — which makes it trivially unit-testable and easy to evolve.

### No Prisma schema changes

This plan requires **no database migrations**. Storing a sent-email audit log is explicitly
out of scope (see Out of Scope below). The `User` and `Order` models already contain all
fields needed.

## Scope

### In Scope

- Install `nodemailer` and `@types/nodemailer` in `apps/store-api`
- Extend `EnvironmentVariables` in `env.validation.ts` with optional mail config vars
  (all `@IsOptional()` so the app boots without SMTP credentials)
- A pure TypeScript order-confirmation template builder function (+ unit tests, TDD)
- `MailService` — builds a nodemailer transport from `ConfigService`; exposes
  `sendOrderConfirmation({ to, order, customerName? })`; is a no-op when mail is disabled
- `MailModule` — global NestJS module exposing `MailService`
- Export `UserRepository` from `UserModule` so `OrderService` can fetch the recipient email
- Import `MailModule` and `UserModule` into `OrderModule`
- Wire the dispatch call into `OrderService.createOrder`, fault-isolated in `try/catch`
- Extend `order.service.spec.ts` with dispatch and fault-isolation test cases
- `MailService` unit tests (mocked nodemailer transport)
- Order e2e test update: mock/spy `MailService` so no SMTP is attempted; optionally assert
  it was invoked

### Out of Scope

- HTML email design polish / responsive email framework (MJML, Cerberus, etc.)
- Any email other than the order-creation confirmation: shipping/dispatch notifications,
  delivery confirmations, password-reset emails, payment-received emails (these belong in
  future tasks; see TASK-049 for abandoned-cart follow-up)
- Storing a sent-email audit log in the database (future / Phase 5 hardening)
- Retry queues / BullMQ / async job workers (noted as future improvement in Risks)
- Internationalization of email copy (single-language English for MVP)
- DKIM / SPF / DMARC deliverability infrastructure (operational concern, not code)
- Frontend changes of any kind
- Orval regeneration (no public API surface changes)

## User Stories

1. As a customer who has just placed an order, I want to receive a confirmation email with
   my order details, so that I have a record of my purchase and can track what I ordered.
2. As a developer, I want the app to boot and all tests to pass even when SMTP credentials
   are absent, so that CI and local dev environments are not blocked by missing mail config.
3. As an ops engineer, I want every email send attempt logged (success and failure), so that
   I can diagnose delivery problems without exposing credentials or email bodies.

## Technical Design

### Hook point in OrderService

`createOrder` in `apps/store-api/src/order/order.service.ts` already follows the pattern:

```
1. Validate cart (NotFoundException / BadRequestException)
2. createFromCart (repository, atomic transaction)
3. logger.log(`Order ${order.id} created for user ${userId}`)
4. return OrderEntity.fromPrisma(order)
```

After step 3, before step 4, add:

```ts
try {
  const user = await this.userRepository.findById(userId);
  if (user) {
    await this.mailService.sendOrderConfirmation({
      to: user.email,
      order: OrderEntity.fromPrisma(order),
      customerName: user.firstName ?? undefined,
    });
    this.logger.log(
      `Order confirmation email sent to ${user.email} for order ${order.id}`,
    );
  }
} catch (err) {
  this.logger.error(
    `Failed to send order confirmation email for order ${order.id}: ${String(err)}`,
  );
}
```

The `try/catch` ensures that any mail error (SMTP timeout, null user, template crash) is
absorbed and logged at error level. The outer `createOrder` always returns the order.

### Recipient email lookup — recommended approach (Approach A)

The order record only carries `userId`. The customer email lives on the `User` table.

**Approach A (recommended):** Inject `UserRepository` into `OrderService`. `UserRepository`
already has `findById(id): Promise<User | null>` returning the full `User` Prisma record
including `email` and `firstName`. This requires:

- `UserModule` to add `UserRepository` to its `exports` array (currently only `UserService`
  is exported — see `apps/store-api/src/user/user.module.ts` line 9)
- `OrderModule` to add `UserModule` to its `imports` array

**Approach B (not chosen):** Extend `OrderRepository.createFromCart` (and related queries)
to include `user: { select: { email: true, firstName: true } }` in the Prisma include. This
changes the `OrderWithItems` interface in `order.types.ts` and every caller. Chosen against
because it couples the repository type to the mail use-case and creates more type churn.

### MailModule structure

```
apps/store-api/src/mail/
  mail.module.ts                          — global NestJS module
  mail.service.ts                         — nodemailer transport + sendOrderConfirmation
  mail.service.spec.ts                    — unit tests (mocked transport)
  templates/
    order-confirmation.template.ts        — pure function: (params) => { subject, html, text }
    order-confirmation.template.spec.ts   — TDD unit tests
  index.ts                                — barrel: export { MailModule, MailService }
```

`MailModule` is registered as `@Global()` so it can be imported once in `AppModule` (or in
`OrderModule`) without being re-declared in every consuming module. Given the narrow current
scope (only `OrderModule` uses it), importing it directly in `OrderModule` is acceptable for
MVP; the global decorator is still recommended for future extensibility.

### MailService responsibilities

- Reads `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`,
  and `MAIL_FROM` from `ConfigService` at service initialization.
- If `MAIL_ENABLED` is falsy (or not set), `sendOrderConfirmation` is a **logged no-op** —
  it logs at debug level and returns immediately without creating a nodemailer transport. It
  does **not** throw.
- Otherwise, creates a nodemailer transport and calls `transport.sendMail(...)`.
- The subject and HTML/text are produced by the pure template builder function.
- Uses `@nestjs/common` `Logger` (consistent with `OrderService` which already uses it;
  `nestjs-pino` is wired globally and intercepts `Logger` output as structured JSON in
  production — both approaches coexist safely).

### Template builder (pure function)

```ts
// mail/templates/order-confirmation.template.ts

export interface OrderConfirmationParams {
  customerName?: string;
  order: {
    id: string;
    createdAt: Date;
    items: Array<{
      productName: string;
      variantName: string | null;
      quantity: number;
      price: string;
      lineTotal: string;
    }>;
    subtotal: string;
    discount: string;
    shippingCost: string;
    tax: string;
    total: string;
    shippingAddress: {
      firstName: string;
      lastName: string;
      address1: string;
      address2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    } | null;
  };
}

export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}

export function buildOrderConfirmationEmail(
  params: OrderConfirmationParams,
): MailTemplate {
  // Returns { subject, html, text }
  // subject includes the order id prefix (first 8 chars)
  // html contains item table, totals, address
  // text is a plain-text fallback
}
```

The function receives a plain data object (not the `OrderEntity` class) so the template
stays free of NestJS decorators and is importable in any context (including pure unit tests
with no DI container).

`OrderEntity` already has all the fields required (`id`, `createdAt`, `items`,
`subtotal`, `discount`, `shippingCost`, `tax`, `total`, `shippingAddress`) — no model
changes needed.

### Environment variables

All new vars are `@IsOptional()` in `EnvironmentVariables` so validation never blocks
startup when mail is unconfigured.

| Variable       | Type   | Description                                                          | Default     |
| -------------- | ------ | -------------------------------------------------------------------- | ----------- |
| `MAIL_ENABLED` | string | Set to `"true"` to enable real SMTP sending                          | off (falsy) |
| `SMTP_HOST`    | string | SMTP server hostname                                                 | —           |
| `SMTP_PORT`    | number | SMTP server port (e.g. 587 for STARTTLS, 465 for SSL)                | —           |
| `SMTP_SECURE`  | string | `"true"` for SSL/TLS; STARTTLS used otherwise                        | —           |
| `SMTP_USER`    | string | SMTP authentication username                                         | —           |
| `SMTP_PASS`    | string | SMTP authentication password                                         | —           |
| `MAIL_FROM`    | string | Sender display name + address, e.g. `"Store <no-reply@example.com>"` | —           |

**Important:** `.env*` files are blocked from editing by the Husky pre-commit hook. The
implementer must document required vars in `.env.example` (check if
`apps/store-api/.env.example` exists — it does not as of 2026-06-11; create it), or add
them to a project README / docs comment. Never commit actual credentials.

For local development without a real SMTP server, use
[Ethereal Email](https://ethereal.email/) (free, catch-all fake SMTP, no signup needed) or
add a MailHog container to `docker-compose.yml` (out of scope for this task but noted as a
future improvement).

### Testing strategy summary

| Layer                            | Approach                                                        | TDD Required                                       |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Template builder (pure function) | TDD — Red first, then Green, then Refactor                      | Yes                                                |
| `MailService` unit tests         | Write tests alongside implementation; mock nodemailer transport | No (service glue code, not complex business logic) |
| `OrderService` unit tests        | Extend existing `order.service.spec.ts`                         | No                                                 |
| Order e2e tests                  | Extend `test/order.e2e-spec.ts`; mock `MailService`             | No                                                 |

## Tasks

---

### TASK-037-A: Install nodemailer + add mail env vars to env.validation.ts

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — adding dependencies and env validation declarations; no business logic
**Depends on:** TASK-037 (this plan)

**Acceptance Criteria:**

- [ ] `nodemailer` and `@types/nodemailer` are listed in `apps/store-api/package.json` dependencies
- [ ] `npm install` (or `npm install -w apps/store-api`) runs without error
- [ ] `EnvironmentVariables` in `apps/store-api/src/config/env.validation.ts` has new optional properties:
      `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT` (`@IsInt()`), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
      — all decorated with `@IsOptional()` (and `@IsString()` / `@IsInt()` as appropriate)
- [ ] App still boots without any of the new vars set (existing tests pass: `npm run test -w apps/store-api`)
- [ ] `apps/store-api/.env.example` exists and lists all new mail vars with placeholder values and comments
- [ ] `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-api/package.json` — add `nodemailer` to dependencies, `@types/nodemailer` to devDependencies
- `apps/store-api/src/config/env.validation.ts` — add `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` properties
- `apps/store-api/.env.example` — create with documented mail var placeholders

---

### TASK-037-B: Create the order-confirmation template builder (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes — Red (write failing tests) → Green (implement function) → Refactor
**Depends on:** TASK-037-A

**Acceptance Criteria:**

- [ ] `apps/store-api/src/mail/templates/order-confirmation.template.spec.ts` exists and all tests pass
- [ ] Tests (written before implementation) assert:
  - Subject contains the first 8 characters of `order.id` (order number prefix)
  - HTML body contains each item's `productName`
  - HTML body contains each item's `quantity` and `lineTotal`
  - HTML body contains the `total` amount
  - HTML body contains the shipping recipient name (`firstName lastName`)
  - Plain-text body contains all of the above (no HTML tags)
  - `customerName`, when provided, appears in the greeting
  - Function works correctly when `order.shippingAddress` is `null` (no crash, address block omitted)
  - Function works correctly when `order.items` is an empty array
- [ ] `apps/store-api/src/mail/templates/order-confirmation.template.ts` exports:
  - `OrderConfirmationParams` interface
  - `MailTemplate` interface (`{ subject: string; html: string; text: string }`)
  - `buildOrderConfirmationEmail(params: OrderConfirmationParams): MailTemplate` pure function
- [ ] The function has no NestJS or nodemailer imports — it is a pure module
- [ ] `npm run test -w apps/store-api` passes
- [ ] `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-api/src/mail/templates/order-confirmation.template.ts` — pure builder function
- `apps/store-api/src/mail/templates/order-confirmation.template.spec.ts` — TDD test suite

---

### TASK-037-C: Implement MailService with unit tests

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — MailService is glue code (config reads + nodemailer call); complex logic lives in the template builder (TASK-037-B)
**Depends on:** TASK-037-B

**Acceptance Criteria:**

- [ ] `apps/store-api/src/mail/mail.service.ts` is created with class `MailService`
- [ ] `MailService` injects `ConfigService` via constructor
- [ ] `sendOrderConfirmation(params: { to: string; order: OrderEntity; customerName?: string }): Promise<void>` is implemented
- [ ] When `MAIL_ENABLED` is not `"true"`, `sendOrderConfirmation` logs a debug message and returns immediately without creating a nodemailer transport and without throwing
- [ ] When `MAIL_ENABLED` is `"true"`, the method creates a nodemailer transport from `SMTP_*` config vars and calls `transport.sendMail` with:
  - `from` set to `MAIL_FROM`
  - `to` set to the `to` parameter
  - `subject`, `html`, `text` from `buildOrderConfirmationEmail`
- [ ] `apps/store-api/src/mail/mail.service.spec.ts` exists with tests that:
  - Mock the nodemailer `createTransport` / `sendMail` calls (jest.mock or manual mock)
  - Assert `sendMail` is called with correct `to`, `subject`, and non-empty `html` when enabled
  - Assert `sendMail` is **not** called when `MAIL_ENABLED` is falsy
  - Assert no exception is thrown in either path
- [ ] `npm run test -w apps/store-api` passes
- [ ] `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-api/src/mail/mail.service.ts` — MailService implementation
- `apps/store-api/src/mail/mail.service.spec.ts` — unit tests with mocked transport

---

### TASK-037-D: Create MailModule and barrel export

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — module registration is configuration, not logic
**Depends on:** TASK-037-C

**Acceptance Criteria:**

- [ ] `apps/store-api/src/mail/mail.module.ts` declares a `@Global() @Module({ providers: [MailService], exports: [MailService] })` class `MailModule`
- [ ] `apps/store-api/src/mail/index.ts` barrel exports `MailModule` and `MailService`
- [ ] `MailModule` is added to the `imports` array in `apps/store-api/src/app.module.ts` (or it will be imported directly in `OrderModule` — see TASK-037-E; document the chosen approach in code comment)
- [ ] `npm run build -w apps/store-api` passes
- [ ] `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-api/src/mail/mail.module.ts` — NestJS module definition
- `apps/store-api/src/mail/index.ts` — barrel
- `apps/store-api/src/app.module.ts` — add `MailModule` to imports (if global approach is chosen)

---

### TASK-037-E: Export UserRepository from UserModule; import MailModule + UserModule in OrderModule

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — module wiring only
**Depends on:** TASK-037-D

**Acceptance Criteria:**

- [ ] `apps/store-api/src/user/user.module.ts` `exports` array includes `UserRepository` (in addition to the existing `UserService` export)
- [ ] `apps/store-api/src/order/order.module.ts` `imports` array includes `UserModule` (and `MailModule` if not registered globally)
- [ ] No circular dependency errors at runtime (`npm run build -w apps/store-api` succeeds)
- [ ] Existing order unit tests still pass (`npm run test -w apps/store-api`)
- [ ] `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-api/src/user/user.module.ts` — add `UserRepository` to `exports`
- `apps/store-api/src/order/order.module.ts` — add `UserModule` (and optionally `MailModule`) to `imports`

---

### TASK-037-F: Hook email dispatch into OrderService.createOrder + extend order.service.spec.ts

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — extends existing tested service; fault-isolation pattern is straightforward
**Depends on:** TASK-037-E

**Acceptance Criteria:**

- [ ] `OrderService` constructor accepts a new `mailService: MailService` and a new `userRepository: UserRepository` injection (alongside the existing `orderRepository` and `cartRepository`)
- [ ] `createOrder` calls `this.userRepository.findById(userId)` after a successful `createFromCart`
- [ ] `createOrder` calls `this.mailService.sendOrderConfirmation({ to: user.email, order, customerName: user.firstName ?? undefined })` when the user is found
- [ ] The dispatch call is wrapped in a `try/catch`:
  - On success: `logger.log('Order confirmation email sent to <email> for order <orderId>')`
  - On any error: `logger.error(...)` with the order ID and error message; the error is swallowed and `createOrder` continues to `return`
- [ ] The order entity is always returned from `createOrder`, regardless of whether the email succeeded or failed (CRITICAL fault-isolation invariant)
- [ ] `apps/store-api/src/order/order.service.spec.ts` is extended with a new `describe('email dispatch')` block containing:
  - Test: `createOrder` calls `mailService.sendOrderConfirmation` with the correct `to` (user's email), order entity, and `customerName` after a successful create
  - Test: when `mailService.sendOrderConfirmation` rejects (throws), `createOrder` **still resolves** with the `OrderEntity` (not rejects)
  - Test: when `userRepository.findById` returns `null`, no email is attempted and `createOrder` still resolves with the `OrderEntity`
- [ ] A mocked `MailService` (`{ sendOrderConfirmation: jest.fn() }`) and mocked `UserRepository` (`{ findById: jest.fn() }`) are added to the `TestingModule` providers in `order.service.spec.ts`
- [ ] All pre-existing `order.service.spec.ts` tests continue to pass (the new mocks must be wired without breaking the existing test setup)
- [ ] `npm run test -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — inject `MailService` + `UserRepository`; add dispatch block in `createOrder`
- `apps/store-api/src/order/order.service.spec.ts` — extend with email dispatch + fault-isolation tests; add mocks for `MailService` and `UserRepository`

---

### TASK-037-G: (Stretch / Out of Scope for this task) Payment-confirmed email

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-037-F, TASK-034

**Note:** This sub-task is explicitly marked **out of scope** for TASK-037 and is documented
here only for future reference. Sending a "payment received" email on `confirmPayment`
(or via the Stripe webhook handler in TASK-034) is a valuable follow-up but must not be
conflated with the order-creation confirmation. Schedule as a separate task under TASK-034
or TASK-049.

**Files to create/modify:**

- (deferred)

---

### TASK-037-H: Build / lint / typecheck / test verification gate

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-037-F

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-api` exits 0
- [ ] `npm run lint -w apps/store-api` exits 0 (no ESLint errors or warnings)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test -w apps/store-api` exits 0 (all unit tests green)
- [ ] `npm run test:e2e -w apps/store-api` exits 0 (order e2e tests pass with mocked MailService):
  - `test/order.e2e-spec.ts` is updated to include `MailService` in the mock providers so
    no real SMTP is attempted; `sendOrderConfirmation` is mocked as `jest.fn().mockResolvedValue(undefined)`
  - Optionally assert that `sendOrderConfirmation` was called for the `POST /orders` success case
- [ ] Dev verification note: to manually inspect rendered emails locally, use
      [Ethereal Email](https://ethereal.email/) — generate free credentials, set them in a local
      `.env` file (not committed), set `MAIL_ENABLED=true`, and place an order via the API.
      Alternatively, a MailHog container (`mailhog/mailhog`) can be added to `docker-compose.yml`
      (SMTP on port 1025, web UI on port 8025) as a future quality-of-life improvement.

**Files to create/modify:**

- `apps/store-api/test/order.e2e-spec.ts` — add `MailService` mock provider; optionally assert dispatch

## Implementation Order

The tasks form a strict dependency chain and should be implemented sequentially:

```
TASK-037-A  (install deps + env vars)
    ↓
TASK-037-B  (TDD template builder — Red first, then Green)
    ↓
TASK-037-C  (MailService implementation + unit tests)
    ↓
TASK-037-D  (MailModule + barrel)
    ↓
TASK-037-E  (UserModule export + OrderModule wiring)
    ↓
TASK-037-F  (OrderService dispatch + spec extension)
    ↓
TASK-037-H  (verification gate)
```

TASK-037-G (stretch payment email) is deferred — do not start until TASK-037-H is green
and TASK-034 (payment integration) is complete.

## Risks and Mitigations

| #   | Risk                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Email failure breaks the order** — SMTP timeout or misconfiguration causes `createOrder` to reject, so the customer pays but sees an error | CRITICAL: All mail dispatch is wrapped in `try/catch` inside `createOrder`. Any error is caught and logged at `error` level; the method always returns the `OrderEntity`. The test in TASK-037-F explicitly validates this fault-isolation invariant.                                                                                                                                                 |
| 2   | **Missing SMTP config breaks CI and local dev**                                                                                              | All mail env vars are `@IsOptional()` in `EnvironmentVariables`. When `MAIL_ENABLED` is not `"true"`, `MailService.sendOrderConfirmation` is a no-op and never creates a transport. All unit and e2e tests mock `MailService` out entirely — no real SMTP is ever needed in automated test environments.                                                                                              |
| 3   | **Slow SMTP handshake blocks the HTTP response**                                                                                             | For MVP, the `sendMail` call is `await`-ed inside the `try/catch` but is already post-`return` in the business-logic sense (the order is already created and logged before the mail block). The HTTP response is still blocked by the mail round-trip. Acceptable at MVP scale. Future improvement: dispatch via BullMQ/Redis job (TASK-049 / Phase 5) to make the response time independent of SMTP. |
| 4   | **PII leaking into logs**                                                                                                                    | Log only `user.email` (recipient address) and `order.id`. Never log full email body content, SMTP credentials, or raw User records. The `logger.error` catch block logs only `String(err)` — ensure the error message does not include password or token fields.                                                                                                                                      |
| 5   | **`.env` files are hook-blocked**                                                                                                            | The pre-commit hook (`.claude/settings.json`) prevents editing `.env*` files. Document all new vars in `apps/store-api/.env.example` (to be created) and in this plan. Implementers set their local `.env` manually; CI sets vars via GitHub Actions secrets.                                                                                                                                         |
| 6   | **Circular dependency between OrderModule and UserModule**                                                                                   | `UserModule` does not import `OrderModule`, so the dependency graph is acyclic: `OrderModule → UserModule`. NestJS module resolution handles this without issue. Verify with `npm run build` after TASK-037-E.                                                                                                                                                                                        |
| 7   | **UserRepository not exported from UserModule**                                                                                              | Currently `UserModule` exports only `UserService` (confirmed: `user.module.ts` line 9). TASK-037-E explicitly adds `UserRepository` to `exports`. Until that task is done, `OrderModule` cannot inject `UserRepository`.                                                                                                                                                                              |

## Notes

- The project uses `nestjs-pino` for structured JSON logging (wired globally in `AppModule`).
  `OrderService` already uses `new Logger(OrderService.name)` from `@nestjs/common`, which
  is compatible — `nestjs-pino` intercepts `Logger` calls and outputs structured JSON in
  production. `MailService` should follow the same `new Logger(MailService.name)` pattern.
- `nodemailer` is chosen over `@nestjs-modules/mailer` + Handlebars to avoid the extra
  dependency and the need for a template engine. The pure TypeScript template builder is
  sufficient for MVP and is easier to unit-test.
- The `OrderEntity` class (fully populated by `OrderEntity.fromPrisma`) provides all fields
  required by the template builder: `id`, `createdAt`, `items` (each with `productName`,
  `variantName`, `quantity`, `price`, `lineTotal`), `subtotal`, `discount`, `shippingCost`,
  `tax`, `total`, `shippingAddress`. No model changes are needed.
- `TASK-037-G` (payment-confirmed email trigger in `confirmPayment`) is explicitly deferred.
  Do not expand scope during implementation of this task.
- TASK-049 (abandoned-cart detection + email follow-up) in Phase 5 will reuse `MailModule`
  and `MailService` — the module is designed to be extended with additional `send*` methods.
