# Plan 114 — Consolidated post-stabilization review (TASK-193)

> Review gate after Етапи 2–3. Read-only audit across all three apps
> (`store-api`, `store-client`, `store-admin`) on four axes: **cleanliness**,
> **optimization**, **security**, **scalability**. Criticals are triaged into
> `fix` tasks; they gate the release, not further feature work (Етап 4 already
> landed — TASK-115/192).

## Verdict

**The codebase is in strong shape post-stabilization.** Clean Architecture and
FSD layering are respected, the security baseline is solid, DB indexing and
N+1 avoidance are handled deliberately, and `typecheck` is green across all
three workspaces. **One production-only critical** was found (isolated raw-SQL
naming bug) plus one low-severity test-infra note.

| #   | Severity    | Area                    | Summary                                                                                                                   | Triage         |
| --- | ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| C1  | 🔴 Critical | store-api / correctness | `CategoryRepository.findDescendantIds` raw SQL targets a non-existent table/column → 500 on category re-parenting in prod | **TASK-238**   |
| L1  | 🟢 Low      | store-client / FSD      | `shared/test/*` imports `@/entities/*` (upward) — test infra only                                                         | note (no task) |

## Method

Evidence-based static audit: schema + module scan, targeted greps for each
anti-pattern, and reads of the hot paths. Automated baseline: `npm run
typecheck` (all workspaces) → **exit 0**. Full test suites were not re-run here
(green on their own branches; heavy suites run serial per repo notes) — a fresh
green run belongs to the TASK-194 pre-deploy gate.

---

## C1 — `findDescendantIds` raw SQL uses wrong table/column names 🔴

**File:** `apps/store-api/src/category/category.repository.ts:462-476`
**Caller:** `apps/store-api/src/category/category.service.ts:223` (cycle
detection when an admin changes a category's `parentId`).

The schema maps every model to snake_case tables (`Category` →
`@@map("categories")`, `parentId` → `@map("parent_id")`). Two of the three
recursive CTEs use the correct physical names:

- `findSubtreeIds` (l.490) → `FROM categories … parent_id` ✅
- `findAncestorIds` (l.519) → `FROM categories … parent_id` ✅
- `findDescendantIds` (l.462) → `FROM "Category" … "parentId"` ❌

Against a real Postgres this throws `relation "Category" does not exist`. The
repository spec mocks `$queryRaw` and only covers `findSubtreeIds` /
`findAncestorIds`, so the bug is **green in tests but crashes in production** —
moving a category under a new parent returns a 500 instead of the intended
`BadRequestException` cycle guard (or a successful move).

**Fix (trivial, low-risk):** mirror the snake_case naming already proven in
`findSubtreeIds` — `"Category"` → `categories`, `"parentId"` → `parent_id`.
Add a real-DB integration assertion for `findDescendantIds` so the mock gap
can't recur. → **TASK-238**.

> Every other raw query is clean: the four `dashboard.repository.ts` `$queryRaw`
> blocks all use snake_case tables/columns (`orders`, `users`, `order_items`,
> `products`, `payment_status`, `created_at`, `product_id`), and are exercised
> by the live dashboard.

## L1 — test infra imports upward across FSD layers 🟢

`shared/test/render.tsx` and `shared/test/msw-handlers.ts` import from
`@/entities/*` (auth-context provider + entity types for mock fixtures). This is
an upward import, but confined to **test-only** infrastructure that must wrap
components in real providers and type its MSW fixtures. Acceptable exception;
optionally document it or move the shared test harness out of the `shared`
public surface. No production code violates the `app → widgets → features →
entities → shared` direction.

---

## Dimension results

### Cleanliness — ✅

- **Clean Architecture (store-api):** no service injects `PrismaService` or
  instantiates `PrismaClient`; all DB access goes through repositories. The only
  `Prisma.*` references in services are typed error guards
  (`PrismaClientKnownRequestError` P2002), which is fine.
- **Dead code:** the deprecated `variantSummary.default*` trio (TASK-235) has
  **zero runtime consumers** — the single reference in
  `product-card-actions.tsx` is a comment explaining why it is deliberately not
  used. Still populated for contract stability, as designed.
- **Localization:** store-admin has no hardcoded English UI strings after
  TASK-115.

### Optimization — ✅

- **No N+1 on hot paths.** Product listing (`product.repository.findAll` →
  `enrichProducts`) loads products in one query with `include: { brand }`, then
  batch-loads ratings, primary images, and variant siblings via `Promise.all`
  of three set-based queries mapped back by `Map` (dataloader style). Dashboard
  uses `Promise.all` of `aggregate`/`groupBy` + set-based raw queries.
- **Caching:** the product module has a cache layer with explicit invalidation
  on mutation.

### Security — ✅ (manual audit)

- `helmet` (env-aware options), `cookieParser`, CSRF protection on
  `/api/auth/refresh` and `/api/cart`, CORS restricted to a configurable
  allow-list, and a global `ValidationPipe` with `whitelist: true` +
  `forbidNonWhitelisted: true`.
- Global `ThrottlerGuard` (Redis-backed storage) with per-route `@Throttle`
  overrides.
- **Guard coverage:** `AdminGuard` on 20 controllers; an audit for mutating
  endpoints (`@Post/@Patch/@Put/@Delete`) lacking any guard / `@Public` /
  throttle marker returned **empty** — no unguarded mutation surface.
- `/security-review` on the actual release diff + secret/prod-config audit are
  deferred to **TASK-194** (they are that gate's explicit scope).

### Scalability — ✅

- **Indexes:** comprehensive `@@index` coverage — all FKs (`categoryId`,
  `brandId`, `groupId`, `productId`, `userId`, `orderId`, …), soft-delete
  (`deletedAt`), lookups (`slug`, `token`), and composites
  (`productId,sortOrder`, `status,createdAt`, `status,nextAttemptAt`,
  `placement,status`, `categoryId,sortOrder`, `definitionId,value`).
- List endpoints are paginated; set-based reads avoid unbounded per-row fan-out.

---

## Triage

| Task                                                                        | Severity    | Status |
| --------------------------------------------------------------------------- | ----------- | ------ |
| TASK-238 — fix `findDescendantIds` snake_case naming + add real-DB coverage | 🔴 Critical | ⬜     |

No High/Medium findings. TASK-238 is the only release-gating item from this
review; TASK-194 (pre-deploy gate) remains the next sequential review gate.
