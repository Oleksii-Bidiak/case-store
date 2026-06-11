# Plan 021: Payment Integration (Stripe Stub)

> **Status:** In Progress
> **Phase:** Phase 3 — Checkout & Orders
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11
> **BACKLOG task:** TASK-034

## Overview

Implement the Payment module for the NestJS backend as a **Stripe-compatible
stub**. The stub exercises the full Stripe integration surface (payment intent
creation, confirmation, webhook event processing, signature verification) using
in-process fakes and environment guards so no real Stripe network call or live
secret key is required to boot the application or run tests. The code is
structured so a real Stripe SDK integration can drop in with minimal changes:
the stub adapter is behind an interface, and switching to a live adapter is a
single provider swap.

The module integrates with the existing `OrderModule` through two seams already
prepared by TASK-033:

- `OrderRepository.updatePaymentStatus(orderId, paymentStatus)` — used by the
  webhook handler to flip `Order.paymentStatus` from `PENDING` to `PAID` /
  `FAILED`.
- `OrderService.updateStatus(orderId, status)` — used to advance the order from
  `PENDING` to `CONFIRMED` after a successful payment.

**Stub scope definition:** The stub behaves exactly like a real Stripe
integration from the API consumer's perspective — the same HTTP endpoints,
the same JSON shapes, the same webhook signature header — but the "payment
processor" side is replaced by an in-process `StubPaymentProvider` that
immediately marks payments as succeeded (or failed if a special test
`orderId` prefix is used). No HTTP call to `api.stripe.com` is ever made.

## Scope

### In Scope

- `PaymentModule` NestJS module (PaymentController, PaymentService,
  PaymentRepository, PaymentProvider interface + StubPaymentProvider)
- `POST /payments/intent` — create a payment intent for an order
- `POST /payments/confirm` — confirm a payment intent (stub only; real Stripe
  handles this client-side, but the stub needs an explicit confirm step)
- `POST /payments/webhook` — receive raw Stripe-shaped webhook events;
  verify signature (stub uses a fixed HMAC secret for tests); update
  `Order.paymentStatus` and `Order.status`
- Prisma schema additions: `Payment` model to record each payment attempt
  (intent ID, provider, amount, status, raw event log)
- `PaymentStatus` enum already exists — used as-is
- New `PaymentIntentStatus` enum for the payment record lifecycle
- Environment variable extensions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PAYMENT_PROVIDER` (defaults to `"stub"` so tests never need real keys)
- TDD unit tests for `PaymentService` (critical money path)
- E2E tests for all three endpoints (mock repository boundary)
- Orval regeneration so the checkout frontend (TASK-035) can use typed hooks

### Out of Scope

- Real Stripe API calls (deferred to a future "stripe-live" adapter swap)
- Stripe Elements / client-side payment form (that is TASK-035)
- Refund flows (admin action — TASK-041 / Phase 4)
- Email notification on payment (TASK-037)
- Idempotency key handling beyond the stub (Phase 5 hardening)
- Currency support beyond a single currency (MVP uses UAH / USD flat)

## User Stories

1. As an authenticated customer, I want to initiate payment for my pending
   order, so that I can complete my purchase.
2. As a payment gateway (Stripe), I want to send a signed webhook event when a
   payment succeeds or fails, so that the order status is updated automatically.
3. As a developer, I want to run the full checkout flow in a local environment
   without real Stripe credentials, so that I can develop and test without
   side effects.
4. As the system, I want every payment attempt recorded, so that finance can
   audit every transaction.

## Technical Design

### Data Model

One new Prisma model is needed. The `PaymentStatus` and `OrderStatus` enums
already exist and are sufficient.

```prisma
// New enum for the payment record's lifecycle (distinct from Order.paymentStatus)
enum PaymentIntentStatus {
  CREATED    // intent has been created, awaiting client confirmation
  PROCESSING // confirmation received, awaiting provider response
  SUCCEEDED  // provider confirmed payment
  FAILED     // provider reported failure
  CANCELLED  // intent cancelled before processing
}

// New model — one record per payment attempt on an order
model Payment {
  id              String              @id @default(uuid())
  orderId         String              @map("order_id")
  order           Order               @relation(fields: [orderId], references: [id])
  provider        String              // "stub" | "stripe"
  providerIntentId String?            @map("provider_intent_id") // Stripe PaymentIntent ID
  amount          Decimal             @db.Decimal(10, 2)
  currency        String              @default("UAH") @db.Char(3)
  status          PaymentIntentStatus @default(CREATED)
  rawEvent        Json?               @map("raw_event") // last webhook payload (debug only)
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  @@index([orderId])
  @@index([providerIntentId])
  @@map("payments")
}
```

The `Order` model also needs a back-relation added:

```prisma
// In the existing Order model, add:
payments Payment[]
```

A Prisma migration is required for this plan (unlike TASK-033 which needed
none).

### Provider Interface Pattern

The stub architecture follows the same adapter pattern used by `JwtModule`
(injected via `ConfigService`). A `PAYMENT_PROVIDER_TOKEN` injection token
selects which concrete provider is registered:

```ts
// payment/providers/payment-provider.interface.ts
export interface PaymentIntentResult {
  providerIntentId: string;
  clientSecret: string; // opaque token the client uses to confirm
  amount: number; // in smallest currency unit (kopiiky / cents)
  currency: string;
}

export interface PaymentConfirmResult {
  providerIntentId: string;
  status: "succeeded" | "failed";
}

export interface IPaymentProvider {
  createIntent(params: {
    orderId: string;
    amount: number;
    currency: string;
  }): Promise<PaymentIntentResult>;

  confirmIntent(providerIntentId: string): Promise<PaymentConfirmResult>;

  verifyWebhookSignature(rawBody: Buffer, signature: string): WebhookEvent;
}

export interface WebhookEvent {
  type: string; // e.g. "payment_intent.succeeded"
  data: {
    object: {
      id: string; // providerIntentId
      metadata: { orderId: string };
      status: string;
    };
  };
}
```

```ts
// payment/providers/stub-payment.provider.ts
// IPaymentProvider implementation that never calls external APIs.
// - createIntent: returns a deterministic clientSecret = `stub_secret_${uuid}`
// - confirmIntent: immediately returns "succeeded" unless providerIntentId
//   starts with "fail_" (test failure path)
// - verifyWebhookSignature: validates HMAC-SHA256 using STRIPE_WEBHOOK_SECRET
//   (test value: "stub_webhook_secret_for_tests"). Rejects on mismatch.
```

### PaymentRepository

```ts
class PaymentRepository {
  create(data: CreatePaymentData): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  findByOrderId(orderId: string): Promise<PaymentRecord[]>;
  findByProviderIntentId(
    providerIntentId: string,
  ): Promise<PaymentRecord | null>;
  updateStatus(
    id: string,
    status: PaymentIntentStatus,
    rawEvent?: object,
  ): Promise<PaymentRecord>;
}
```

### PaymentService

```ts
class PaymentService {
  // Create a payment intent for an order.
  // Throws NotFoundException if the order does not exist.
  // Throws ConflictException if order.paymentStatus is already PAID.
  // Throws BadRequestException if order.paymentStatus is FAILED more than 3 times.
  async createPaymentIntent(
    userId: string,
    orderId: string,
  ): Promise<{ clientSecret: string; paymentId: string }>;

  // Stub-only confirm endpoint: triggers the provider confirmIntent and then
  // handles the result exactly as the webhook handler would.
  // Throws NotFoundException if the payment record is not found.
  async confirmPayment(paymentId: string): Promise<PaymentRecord>;

  // Process an inbound webhook event (called by controller after signature check).
  // Idempotent: re-processing an already-SUCCEEDED event is a no-op.
  async handleWebhookEvent(event: WebhookEvent): Promise<void>;
}
```

**Payment state machine (enforced in PaymentService):**

```
CREATED    → PROCESSING  (on confirmIntent call)
PROCESSING → SUCCEEDED   (on payment_intent.succeeded webhook)
PROCESSING → FAILED      (on payment_intent.payment_failed webhook)
SUCCEEDED  → (terminal — no further transitions)
FAILED     → CREATED     (on retry — new payment intent created for the same order)
```

**Order status side effects (driven by PaymentService):**

| Payment event              | `Order.paymentStatus` | `Order.status`        |
| -------------------------- | --------------------- | --------------------- |
| `payment_intent.succeeded` | `PAID`                | `CONFIRMED`           |
| `payment_intent.failed`    | `FAILED`              | unchanged (`PENDING`) |

These side effects use `OrderRepository.updatePaymentStatus` and
`OrderService.updateStatus` which are already implemented and tested.

### PaymentController Endpoints

All endpoints are under `/payments`. Only the intent creation requires a JWT.
The webhook endpoint is public but must pass signature verification.

| Method | Path                | Auth            | operationId            |
| ------ | ------------------- | --------------- | ---------------------- |
| POST   | `/payments/intent`  | JwtAuthGuard    | `createPaymentIntent`  |
| POST   | `/payments/confirm` | JwtAuthGuard    | `confirmPayment`       |
| POST   | `/payments/webhook` | None (raw body) | `handlePaymentWebhook` |

**POST /payments/intent**

Request body (`CreatePaymentIntentDto`):

```json
{ "orderId": "uuid" }
```

Response `201`:

```json
{ "data": { "paymentId": "uuid", "clientSecret": "stub_secret_..." } }
```

**POST /payments/confirm** (stub only — not exposed in production)

Request body (`ConfirmPaymentDto`):

```json
{ "paymentId": "uuid" }
```

Response `200`:

```json
{ "data": { "paymentId": "uuid", "status": "succeeded" } }
```

**POST /payments/webhook**

- Receives raw body (`Buffer`) — requires `RawBodyMiddleware` or
  `express.raw()` scoped to `/api/payments/webhook` only.
- Reads `stripe-signature` header.
- Returns `200 { received: true }` on success.
- Returns `400` on invalid signature or unrecognised event type.

**Why raw body for the webhook:** Stripe signs the raw bytes of the request.
NestJS's `ValidationPipe` normally transforms the body to JSON first, which
changes the bytes and breaks signature verification. The webhook route must
bypass JSON parsing and receive the original `Buffer`.

### Environment Variables

Three new optional variables added to `EnvironmentVariables` in
`env.validation.ts`:

```ts
@IsOptional()
@IsString()
STRIPE_SECRET_KEY?: string; // required in production; undefined is fine for stub mode

@IsOptional()
@IsString()
@MinLength(16)
STRIPE_WEBHOOK_SECRET?: string; // required for webhook verification

@IsOptional()
@IsString()
@IsIn(['stub', 'stripe'])
PAYMENT_PROVIDER?: string; // defaults to "stub"
```

The `StubPaymentProvider` uses `STRIPE_WEBHOOK_SECRET ?? 'stub_webhook_secret_for_tests'`
so the app boots without any extra env configuration in CI or local dev.

### Module Registration

```ts
@Module({
  imports: [ConfigModule, OrderModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    PaymentService,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useClass: StubPaymentProvider, // swapped to StripePaymentProvider in production
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
```

`PaymentModule` imports `OrderModule` (which exports `OrderService`) to access
`OrderService.updateStatus`. It also uses `OrderRepository` directly via
`OrderModule`'s providers — `OrderModule` must export `OrderRepository` for
this (a one-line addition to `order.module.ts` exports).

### Raw Body Middleware

NestJS's global `ValidationPipe` JSON-parses all bodies before the controller
is reached. Stripe webhook signature verification requires the original raw
bytes. The solution is to configure a custom `bodyParser` option at
`NestFactory.create` time:

```ts
// main.ts adjustment
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true, // enables req.rawBody for all routes
});
```

With `rawBody: true`, NestJS 10+ exposes the raw body on `req.rawBody`. The
webhook controller reads it via `@RawBody() rawBody: Buffer`.

### API Contract

| Method | Path                    | Request                       | Response                                    |
| ------ | ----------------------- | ----------------------------- | ------------------------------------------- |
| POST   | `/api/payments/intent`  | `CreatePaymentIntentDto`      | `201 { data: { paymentId, clientSecret } }` |
| POST   | `/api/payments/confirm` | `ConfirmPaymentDto`           | `200 { data: { paymentId, status } }`       |
| POST   | `/api/payments/webhook` | raw Buffer + stripe-signature | `200 { received: true }`                    |

## Tasks

### TASK-034-A: Prisma migration — add Payment model and PaymentIntentStatus enum

**Type:** feat
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `PaymentIntentStatus` enum added to `apps/store-api/prisma/schema.prisma`:
      values `CREATED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`
- [ ] `Payment` model added to `apps/store-api/prisma/schema.prisma` with fields:
      `id`, `orderId`, `order` (relation), `provider`, `providerIntentId`,
      `amount` (Decimal 10,2), `currency` (Char 3, default "UAH"),
      `status` (PaymentIntentStatus, default CREATED), `rawEvent` (Json?),
      `createdAt`, `updatedAt`
- [ ] Indexes on `orderId` and `providerIntentId`
- [ ] Back-relation `payments Payment[]` added to the `Order` model
- [ ] `npx prisma migrate dev --name add-payment-model` runs cleanly and
      creates a new migration file under `apps/store-api/prisma/migrations/`
- [ ] `npx prisma generate` runs without errors; `Payment` and
      `PaymentIntentStatus` are present in the generated Prisma Client
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add `PaymentIntentStatus` enum,
  `Payment` model, and `payments Payment[]` back-relation on `Order`
- `apps/store-api/prisma/migrations/<timestamp>_add_payment_model/` — generated
  by Prisma CLI (do not hand-edit)

---

### TASK-034-B: Update env.validation.ts with Stripe/payment env vars

**Type:** feat
**Scope:** store-api
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `EnvironmentVariables` class in `apps/store-api/src/config/env.validation.ts`
      extended with three optional fields: - `STRIPE_SECRET_KEY?: string` — `@IsOptional() @IsString()` - `STRIPE_WEBHOOK_SECRET?: string` — `@IsOptional() @IsString() @MinLength(16)` - `PAYMENT_PROVIDER?: string` — `@IsOptional() @IsString() @IsIn(['stub', 'stripe'])`
- [ ] Application still boots without any of these variables set (all optional)
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` exits with code 0
- [ ] `.env.example` (if present) or inline code comment documents the new
      variables and their expected values for stub vs real Stripe mode

**Files to modify:**

- `apps/store-api/src/config/env.validation.ts` — add the three optional fields

---

### TASK-034-C: Create Payment domain types, entities, and DTOs

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-034-A

**Acceptance Criteria:**

- [ ] `payment.types.ts` created, exporting:
  - `PaymentRecord` interface — mirrors the `Payment` Prisma model fields
    with `Decimal` typed as `{ toString(): string }` (same pattern as
    `OrderWithItems`)
  - `CreatePaymentData` interface — `{ orderId, provider, providerIntentId?,
amount: Prisma.Decimal, currency, status: PaymentIntentStatus }`
  - `WebhookEvent` interface — `{ type: string; data: { object: {
id: string; metadata: { orderId: string }; status: string } } }`
  - `PaymentIntentResult` interface — `{ providerIntentId, clientSecret,
amount, currency }`
  - `PaymentConfirmResult` interface — `{ providerIntentId, status:
'succeeded' | 'failed' }`

- [ ] `IPaymentProvider` interface created in
      `payment/providers/payment-provider.interface.ts`:
  - `createIntent(params): Promise<PaymentIntentResult>`
  - `confirmIntent(providerIntentId: string): Promise<PaymentConfirmResult>`
  - `verifyWebhookSignature(rawBody: Buffer, signature: string): WebhookEvent`
  - `PAYMENT_PROVIDER_TOKEN` injection constant exported from the same file

- [ ] `PaymentEntity` class created in `payment/entities/payment.entity.ts`:
  - Fields: `id`, `orderId`, `provider`, `providerIntentId: string | null`,
    `amount: string`, `currency`, `status: PaymentIntentStatus`,
    `createdAt`, `updatedAt`
  - `static fromRecord(record: PaymentRecord): PaymentEntity`
  - All fields decorated with `@ApiProperty`

- [ ] `CreatePaymentIntentDto` created:
  - `orderId: string` — `@IsUUID() @IsNotEmpty()`
  - `@ApiProperty`

- [ ] `ConfirmPaymentDto` created:
  - `paymentId: string` — `@IsUUID() @IsNotEmpty()`
  - `@ApiProperty`

- [ ] `PaymentIntentResponseDto` created (used by controller response):
  - `paymentId: string`
  - `clientSecret: string`

- [ ] All types exported via `payment/types/index.ts`,
      `payment/entities/index.ts`, `payment/dto/index.ts` barrels
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/payment/payment.types.ts`
- `apps/store-api/src/payment/providers/payment-provider.interface.ts`
- `apps/store-api/src/payment/entities/payment.entity.ts`
- `apps/store-api/src/payment/entities/index.ts`
- `apps/store-api/src/payment/dto/create-payment-intent.dto.ts`
- `apps/store-api/src/payment/dto/confirm-payment.dto.ts`
- `apps/store-api/src/payment/dto/index.ts`

---

### TASK-034-D: Implement StubPaymentProvider

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-034-C, TASK-034-B

**Acceptance Criteria:**

- [ ] `StubPaymentProvider` class created implementing `IPaymentProvider`,
      decorated with `@Injectable()`
- [ ] Constructor injects `ConfigService`; reads
      `STRIPE_WEBHOOK_SECRET ?? 'stub_webhook_secret_for_tests'`
- [ ] `createIntent(params)`:
  - Generates `providerIntentId = 'pi_stub_' + randomUUID()`
  - `clientSecret = providerIntentId + '_secret'`
  - Returns `{ providerIntentId, clientSecret, amount: params.amount, currency: params.currency }`
  - Never calls any external HTTP endpoint
- [ ] `confirmIntent(providerIntentId)`:
  - If `providerIntentId` starts with `'pi_stub_fail_'` → returns
    `{ providerIntentId, status: 'failed' }`
  - Otherwise → returns `{ providerIntentId, status: 'succeeded' }`
  - Never calls any external HTTP endpoint
- [ ] `verifyWebhookSignature(rawBody, signature)`:
  - Computes `expectedSig = 'sha256=' + HMAC-SHA256(rawBody, webhookSecret)`
    using Node.js `crypto` module
  - Compares `signature` to `expectedSig` using `crypto.timingSafeEqual`
  - Throws `BadRequestException('Invalid webhook signature')` on mismatch
  - On success, parses `rawBody.toString('utf8')` as JSON and returns it
    as a `WebhookEvent`; throws `BadRequestException('Invalid webhook payload')`
    if JSON.parse fails
- [ ] `private readonly logger = new Logger(StubPaymentProvider.name)`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/payment/providers/stub-payment.provider.ts`

---

### TASK-034-E: Implement PaymentRepository

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-034-A, TASK-034-C

**Acceptance Criteria:**

- [ ] `PaymentRepository` class created, decorated with `@Injectable()`
- [ ] Constructor injects only `PrismaService`
- [ ] `create(data: CreatePaymentData): Promise<PaymentRecord>` — creates a
      `Payment` row; returns the created record
- [ ] `findById(id: string): Promise<PaymentRecord | null>` — `prisma.payment.findUnique`
- [ ] `findByOrderId(orderId: string): Promise<PaymentRecord[]>` — ordered by
      `createdAt desc`
- [ ] `findByProviderIntentId(providerIntentId: string): Promise<PaymentRecord | null>`
- [ ] `updateStatus(id: string, status: PaymentIntentStatus, rawEvent?: object): Promise<PaymentRecord>`
      — updates `status` and optionally `rawEvent` in one `prisma.payment.update` call
- [ ] `private readonly logger = new Logger(PaymentRepository.name)`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/payment/payment.repository.ts`

---

### TASK-034-F: Write failing unit tests for PaymentService (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M (3-4h)
**TDD Required:** Yes
**Depends on:** TASK-034-C, TASK-034-D, TASK-034-E

**Acceptance Criteria:**

- [ ] Test file `payment.service.spec.ts` created following the same structure
      as `order.service.spec.ts` (constants section, mock data section, mock
      providers section, describe blocks per method)
- [ ] Mock objects defined for `PaymentRepository`, `OrderRepository`,
      `OrderService`, and `IPaymentProvider` (stub provider mock)
- [ ] Mock `PaymentRecord` fixture defined (all fields populated, status CREATED)
- [ ] Mock `OrderWithItems` fixture reused from the order tests pattern

- [ ] **`createPaymentIntent` tests (all failing — Red):**
  - Creates a `Payment` record and returns `{ clientSecret, paymentId }` for a
    PENDING order with paymentStatus PENDING
  - Throws `NotFoundException` when `orderRepository.findById` returns null
  - Throws `ConflictException('Order has already been paid')` when
    `order.paymentStatus === PaymentStatus.PAID`
  - Calls `provider.createIntent` with the correct `{ orderId, amount, currency }`
  - Calls `paymentRepository.create` with `status: PaymentIntentStatus.CREATED`
    and the `providerIntentId` from the provider result

- [ ] **`confirmPayment` tests (all failing — Red):**
  - On `provider.confirmIntent` returning `status: 'succeeded'`:
    - Calls `paymentRepository.updateStatus(id, PROCESSING)` before calling the provider
    - Calls `paymentRepository.updateStatus(id, SUCCEEDED)` after success
    - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.PAID)`
    - Calls `orderService.updateStatus(orderId, OrderStatus.CONFIRMED)`
    - Returns the updated `PaymentRecord`
  - On `provider.confirmIntent` returning `status: 'failed'`:
    - Calls `paymentRepository.updateStatus(id, FAILED)`
    - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.FAILED)`
    - Does NOT call `orderService.updateStatus`
  - Throws `NotFoundException` when `paymentRepository.findById` returns null

- [ ] **`handleWebhookEvent` tests (all failing — Red):**
  - `payment_intent.succeeded` event:
    - Calls `paymentRepository.updateStatus(paymentId, SUCCEEDED, rawEvent)`
    - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.PAID)`
    - Calls `orderService.updateStatus(orderId, OrderStatus.CONFIRMED)`
  - `payment_intent.payment_failed` event:
    - Calls `paymentRepository.updateStatus(paymentId, FAILED, rawEvent)`
    - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.FAILED)`
    - Does NOT call `orderService.updateStatus`
  - Unrecognised event type — resolves without throwing (no-op, logs warning)
  - Idempotent: if `paymentRecord.status === SUCCEEDED`, calling with a
    `payment_intent.succeeded` event again is a no-op (no further DB writes)

- [ ] All tests **fail** at the end of this task (Red phase — `PaymentService`
      does not yet exist)
- [ ] Test file compiles without TypeScript errors
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/payment/payment.service.spec.ts`

---

### TASK-034-G: Implement PaymentService (TDD — Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M (3-4h)
**TDD Required:** Yes
**Depends on:** TASK-034-F (tests must be written and failing first)

**Acceptance Criteria:**

- [ ] `PaymentService` class created, decorated with `@Injectable()`
- [ ] Constructor injects `PaymentRepository`, `OrderRepository`, `OrderService`,
      and `IPaymentProvider` via `@Inject(PAYMENT_PROVIDER_TOKEN)`
- [ ] `createPaymentIntent(userId, orderId)`:
  1. Fetches order via `orderRepository.findById(orderId)`
  2. Throws `NotFoundException('Order not found')` if null
  3. Throws `ConflictException('Order has already been paid')` if
     `order.paymentStatus === PaymentStatus.PAID`
  4. Converts `order.total` (string) to amount in smallest currency unit
     (multiply by 100, round to integer)
  5. Calls `provider.createIntent({ orderId, amount, currency: 'UAH' })`
  6. Calls `paymentRepository.create({ orderId, provider: 'stub', providerIntentId,
amount: new Prisma.Decimal(order.total), currency: 'UAH',
status: PaymentIntentStatus.CREATED })`
  7. Returns `{ paymentId: payment.id, clientSecret: result.clientSecret }`
  8. Logs `Payment ${payment.id} created for order ${orderId}`

- [ ] `confirmPayment(paymentId)`:
  1. Fetches payment via `paymentRepository.findById(paymentId)`
  2. Throws `NotFoundException('Payment not found')` if null
  3. Updates payment status to `PROCESSING` via `paymentRepository.updateStatus`
  4. Calls `provider.confirmIntent(payment.providerIntentId)`
  5. If `result.status === 'succeeded'`:
     - Calls `paymentRepository.updateStatus(paymentId, SUCCEEDED)`
     - Calls `orderRepository.updatePaymentStatus(payment.orderId, PaymentStatus.PAID)`
     - Calls `orderService.updateStatus(payment.orderId, OrderStatus.CONFIRMED)`
  6. If `result.status === 'failed'`:
     - Calls `paymentRepository.updateStatus(paymentId, FAILED)`
     - Calls `orderRepository.updatePaymentStatus(payment.orderId, PaymentStatus.FAILED)`
  7. Returns the final `PaymentRecord`

- [ ] `handleWebhookEvent(event)`:
  1. Looks up the payment record by `providerIntentId` from `event.data.object.id`
     via `paymentRepository.findByProviderIntentId`
  2. Resolves `orderId` from `event.data.object.metadata.orderId`
  3. On `event.type === 'payment_intent.succeeded'`:
     - If payment record exists and is already `SUCCEEDED` → log and return
       (idempotency guard)
     - Calls `paymentRepository.updateStatus(paymentId, SUCCEEDED, event)`
     - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.PAID)`
     - Calls `orderService.updateStatus(orderId, OrderStatus.CONFIRMED)`
  4. On `event.type === 'payment_intent.payment_failed'`:
     - Calls `paymentRepository.updateStatus(paymentId, FAILED, event)`
     - Calls `orderRepository.updatePaymentStatus(orderId, PaymentStatus.FAILED)`
  5. On unrecognised type: logs `Unknown webhook event type: ${event.type}` and
     returns without error
  6. Logs each significant state transition at `info` level

- [ ] `private readonly logger = new Logger(PaymentService.name)`
- [ ] All tests from TASK-034-F pass (Green phase)
- [ ] `npm run test -w apps/store-api` exits with code 0

**Files to create:**

- `apps/store-api/src/payment/payment.service.ts`

---

### TASK-034-H: Implement PaymentController, raw body middleware, and PaymentModule

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-034-G

**Acceptance Criteria:**

- [ ] `main.ts` updated: `NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })`
      to enable raw body access for the webhook route
- [ ] `PaymentController` created:
  - `@ApiTags('Payments')` at class level
  - `POST /payments/intent` — `@UseGuards(JwtAuthGuard)`, accepts
    `CreatePaymentIntentDto`, calls `paymentService.createPaymentIntent`,
    returns `201 { data: { paymentId, clientSecret } }`
  - `POST /payments/confirm` — `@UseGuards(JwtAuthGuard)`, accepts
    `ConfirmPaymentDto`, calls `paymentService.confirmPayment`,
    returns `200 { data: PaymentEntity }`
  - `POST /payments/webhook` — no guard; reads `@Headers('stripe-signature')
signature: string` and `@RawBody() rawBody: Buffer`; calls
    `provider.verifyWebhookSignature(rawBody, signature)` before delegating
    to `paymentService.handleWebhookEvent(event)`; returns `200 { received: true }`
  - The webhook method catches `BadRequestException` from signature verification
    and re-throws it as-is so the global filter returns `400`
  - Each method has `@ApiOperation({ operationId: '...' })` matching the
    API contract table above

- [ ] `OrderModule` updated: `OrderRepository` added to `exports` array so
      `PaymentModule` can inject it (one-line change to `order.module.ts`)

- [ ] `PaymentModule` created:

  ```ts
  @Module({
    imports: [ConfigModule, OrderModule],
    controllers: [PaymentController],
    providers: [
      PaymentRepository,
      PaymentService,
      { provide: PAYMENT_PROVIDER_TOKEN, useClass: StubPaymentProvider },
    ],
    exports: [PaymentService],
  })
  export class PaymentModule {}
  ```

- [ ] `PaymentModule` registered in `AppModule.imports`
- [ ] `apps/store-api/src/payment/index.ts` barrel created, exporting
      `PaymentModule`, `PaymentService`, `PaymentRepository`
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run lint -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` exits with code 0

**Files to create/modify:**

- `apps/store-api/src/main.ts` — add `rawBody: true` to `NestFactory.create` options
- `apps/store-api/src/payment/payment.controller.ts`
- `apps/store-api/src/payment/payment.module.ts`
- `apps/store-api/src/payment/index.ts`
- `apps/store-api/src/order/order.module.ts` — add `OrderRepository` to `exports`
- `apps/store-api/src/app.module.ts` — add `PaymentModule` to `imports`

---

### TASK-034-I: Write E2E tests for Payment endpoints

**Type:** test
**Scope:** store-api
**Complexity:** L (4-5h)
**TDD Required:** No
**Depends on:** TASK-034-H

**Acceptance Criteria:**

- [ ] E2E test file `apps/store-api/test/payment.e2e-spec.ts` created following
      the same structure as `order.e2e-spec.ts` — mocked `PaymentRepository`,
      `OrderRepository`, `IPaymentProvider`, `CartRepository`,
      `AuthRepository`, `UserRepository`, `PrismaService`; `ThrottlerGuard`
      overridden with pass-through; JWT minted via `JwtService`

- [ ] **POST /api/payments/intent:**
  - Valid JWT + `{ orderId }` pointing to a PENDING order → 201, returns
    `{ data: { paymentId, clientSecret } }`
  - No JWT → 401
  - Missing `orderId` in body → 400
  - `orderId` not UUID format → 400
  - `orderRepository.findById` returns null → 404
  - Order already PAID → 409

- [ ] **POST /api/payments/confirm:**
  - Valid JWT + `{ paymentId }` for an existing CREATED payment → 200,
    returns `{ data: PaymentEntity }` with `status: 'SUCCEEDED'`
  - Payment `providerIntentId` starting with `'pi_stub_fail_'` → 200 but
    payment `status: 'FAILED'` and order `paymentStatus: 'FAILED'`
  - No JWT → 401
  - `paymentRepository.findById` returns null → 404

- [ ] **POST /api/payments/webhook:**
  - Valid raw body + valid HMAC-SHA256 `stripe-signature` →
    200 `{ received: true }`
  - Invalid signature → 400
  - Missing `stripe-signature` header → 400
  - Valid signature but unrecognised event type →
    200 `{ received: true }` (no-op)
  - `payment_intent.succeeded` event with valid data → 200; verifies that
    `orderRepository.updatePaymentStatus` and `orderService.updateStatus`
    were called with correct arguments

- [ ] All e2e tests pass with `npm run test:e2e -w apps/store-api`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/test/payment.e2e-spec.ts`

---

### TASK-034-J: Regenerate Orval API hooks (store-client + store-admin)

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-034-H (controller must be complete with Swagger decorators)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` produces an updated
      `apps/store-api/swagger.json` that contains:
  - `POST /api/payments/intent` with `operationId: createPaymentIntent`
  - `POST /api/payments/confirm` with `operationId: confirmPayment`
  - `POST /api/payments/webhook` with `operationId: handlePaymentWebhook`
  - `PaymentEntity`, `CreatePaymentIntentDto`, `ConfirmPaymentDto` schemas
    present in the spec
  - `Payments` tag present in the spec
- [ ] `npm run generate:api -w apps/store-client` runs without errors; hooks
      generated in `apps/store-client/src/shared/api/generated/payments/`
- [ ] `npm run generate:api -w apps/store-admin` runs without errors
- [ ] `npm run typecheck -w apps/store-client` passes after regeneration
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration
- [ ] TASK-035 (Checkout frontend) is unblocked by this regeneration

**Files modified by tool (do not hand-edit):**

- `apps/store-client/src/shared/api/generated/` — regenerated by Orval
- `apps/store-admin/src/shared/api/generated/` — regenerated by Orval

---

## Migration Steps

Execute subtasks in this order:

1. **TASK-034-A** and **TASK-034-B** in parallel — Prisma migration (A) and env
   validation update (B) have no mutual dependency.
2. **TASK-034-C** — Domain types, entities, DTOs (depends on A for Prisma
   enum types; depends on B is optional — B just adds ConfigService vars).
3. **TASK-034-D** — `StubPaymentProvider` (depends on C for the interface).
4. **TASK-034-E** — `PaymentRepository` (depends on A and C).
5. **TASK-034-F** — Failing unit tests for `PaymentService` (TDD Red; depends
   on C, D, E; all tests must be written before the service).
6. **TASK-034-G** — Implement `PaymentService` (TDD Green; depends on F).
7. **TASK-034-H** — `PaymentController` + `PaymentModule` + wiring (depends on G).
8. **TASK-034-I** — E2E tests (depends on H).
9. **TASK-034-J** — Orval regeneration (depends on H; unblocks TASK-035).

## Risks & Mitigations

| Risk                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Raw body parsing conflict.** Enabling `rawBody: true` globally in `main.ts` may affect existing endpoints if they rely on the transformed JSON body in some way.                  | Only the webhook controller reads `@RawBody()`. All other controllers continue to use `@Body()` with the `ValidationPipe` JSON transformation. The change is additive — `rawBody: true` makes the raw bytes available as an additional property without removing the parsed body. Verify existing e2e tests still pass after the `main.ts` change. |
| **Webhook idempotency.** Stripe may deliver the same webhook event more than once. Processing it twice would double-update the order.                                               | `PaymentService.handleWebhookEvent` has an explicit idempotency guard: if `paymentRecord.status === SUCCEEDED`, a duplicate `payment_intent.succeeded` event is logged and silently dropped.                                                                                                                                                       |
| **`OrderModule` circular dependency.** `PaymentModule` imports `OrderModule`. If `OrderModule` ever imports `PaymentModule`, NestJS will throw a circular-dependency error at boot. | `OrderModule` has no reason to depend on `PaymentModule`. The dependency is strictly one-way. Add a comment in `PaymentModule` noting this constraint.                                                                                                                                                                                             |
| **Stub vs real adapter divergence.** If the stub's webhook payload shape drifts from real Stripe's shape, the real integration will break silently.                                 | The `WebhookEvent` interface is based on Stripe's documented `PaymentIntent` webhook shape. The stub's `verifyWebhookSignature` deserialises the raw JSON against this interface. When switching to the real Stripe SDK (`stripe.webhooks.constructEvent`), the return type is compatible.                                                         |
| **Migration irreversibility.** The `Payment` model migration cannot be easily rolled back once applied to a shared dev/staging DB.                                                  | The migration only adds a new table — it does not alter existing tables beyond adding the `payments Payment[]` back-relation (which is schema-only, no DB column added). Rollback is a simple `DROP TABLE payments`.                                                                                                                               |
| **Amount precision.** Converting `order.total` (a string like "149.97") to cents by multiplying by 100 can introduce floating-point errors.                                         | Use `Math.round(parseFloat(order.total) * 100)` — the same pattern validated in `OrderRepository.createFromCart`. All amounts are stored as `Decimal(10,2)` in Postgres.                                                                                                                                                                           |

## Notes

### Why a stub instead of test mode keys

Real Stripe test-mode keys (`sk_test_...`) would require every developer to
have a Stripe account, set up environment variables, and accept network
dependency in tests. The stub approach means `npm run test` and
`npm run test:e2e` work offline and in CI with zero Stripe configuration.

### Swapping the stub for a real Stripe adapter

When the business is ready for live payments, the swap is:

1. Install `stripe` npm package in `apps/store-api`.
2. Create `apps/store-api/src/payment/providers/stripe-payment.provider.ts`
   implementing `IPaymentProvider` using the real Stripe SDK.
3. Change the `PaymentModule` provider registration:
   ```ts
   {
     provide: PAYMENT_PROVIDER_TOKEN,
     useClass: process.env.PAYMENT_PROVIDER === 'stripe'
       ? StripePaymentProvider
       : StubPaymentProvider,
   }
   ```
4. Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_live_...`, and
   `STRIPE_WEBHOOK_SECRET=whsec_...` in production `.env`.

No changes to `PaymentService`, `PaymentController`, or any consumer are
required.

### OrderRepository export from OrderModule

TASK-033-H registered `OrderRepository` in `OrderModule.providers` but only
exported `OrderService`. `PaymentModule` needs `OrderRepository` directly
(to call `updatePaymentStatus`). TASK-034-H adds `OrderRepository` to
`OrderModule.exports`. This is a safe one-line addition — it only makes an
already-registered provider accessible to importing modules.

### Webhook signature format (stub HMAC)

Real Stripe uses a `t=timestamp,v1=signature` header format and signs
`"${t}.${rawBody}"`. For simplicity, the stub uses a plain
`sha256=<HMAC-SHA256>` format. The `verifyWebhookSignature` implementation
is clearly documented so the real Stripe format can be adopted when switching
providers. The E2E tests generate a matching signature using the same
`crypto.createHmac` logic so they are self-contained.
