# 107 — Contact messages (TASK-177)

CONTACT-MESSAGES vertical of Етап 2. Adds a customer contact/support channel:
a rate-limited public submission endpoint, an admin inbox, and wires the two
existing storefront stub forms (`/contact`, `/info`) to the real API. This is
user-submitted content, NOT published content — it deliberately does **not** use
the publishing pattern (plan 104): no `PublishStatus`, no `isActive`, no
scheduler, no rich-text sanitization (bodies are plain text, escaped on render).

Status: implemented + unit-tested (store-api contact suite green; store-client &
store-admin typecheck + lint + targeted tests green). Migration + Orval regen are
run by the orchestrator.

---

## Data model (`schema.prisma`)

```prisma
enum ContactMessageStatus { NEW READ ARCHIVED }

model ContactMessage {
  id        String               @id @default(uuid())
  name      String
  phone     String
  email     String
  topic     String?
  orderRef  String?              @map("order_ref")
  message   String               @db.Text
  status    ContactMessageStatus @default(NEW)
  adminNote String?              @map("admin_note")
  createdAt DateTime             @default(now()) @map("created_at")
  updatedAt DateTime             @updatedAt      @map("updated_at")

  @@index([status, createdAt(sort: Desc)])
  @@map("contact_messages")
}
```

- `status` drives the admin inbox filter and the sidebar unread badge (count of
  `NEW`). `adminNote` is an internal team note never shown to the customer.
- The `@@index([status, createdAt(sort: Desc)])` backs the default inbox query
  (newest-first, optionally filtered by status).

## Backend module (`apps/store-api/src/contact/`)

Clean Architecture (controller → service → repository); the service never
touches Prisma. Envelope `{ data, meta? }`.

- **DTOs** (`class-validator`, all string inputs trimmed via `@Transform`):
  - `CreateContactMessageDto` — `name` (2–120), `phone` (5–32), `email`
    (`@IsEmail`, ≤255), `message` (10–5000) required; `topic` (≤60),
    `orderRef` (≤120) optional. Body stored as plain text (no `sanitize-html`).
  - `ContactMessageListQueryDto` — `page`, `limit` (≤100), optional `status`.
  - `UpdateContactMessageDto` — optional `status`, optional nullable `adminNote`.
- **Repository** — `create`, `findAll` (status filter + pagination, `createdAt desc`),
  `findById`, `update` (partial: only provided keys written), `countByStatus`.
- **Service** — `create` (trims via DTO, logs receipt), `findAllAdmin`
  (returns entities + `meta` incl. `unread` NEW count), `findByIdAdmin`,
  `unreadCount`, `update` (404 when missing).
- **Entity** — `ContactMessageEntity.fromPrisma`.

### Endpoints (Swagger tag `Contact`)

| Method | Path                              | Guard      | Notes                                                       |
| ------ | --------------------------------- | ---------- | ----------------------------------------------------------- |
| POST   | `/api/contact`                    | public     | rate-limited; returns `{ data: { id } }` only (no PII echo) |
| GET    | `/api/contact/admin`              | AdminGuard | list, `?status`, `?page`, `?limit`; `meta` incl. `unread`   |
| GET    | `/api/contact/admin/unread-count` | AdminGuard | `{ data: { unread } }` for the sidebar badge                |
| GET    | `/api/contact/admin/:id`          | AdminGuard | single message                                              |
| PATCH  | `/api/contact/admin/:id`          | AdminGuard | change status / set adminNote                               |

`unread-count` is declared before `:id` so it is not swallowed by the param route.

### Rate limit

`POST /api/contact` uses `@Throttle({ default: { limit: 5, ttl: 60000 } })` —
5 requests/min per IP, matching the strict auth register/login caps. It is an
unauthenticated public write and a natural spam target. Global default is
100/60s; the throttler storage (Redis when `REDIS_HOST` is set, else in-memory)
is reused unchanged.

### Shared files touched (additive)

- `app.module.ts` — register `ContactModule`.
- `main.ts` + `export-swagger.ts` — add the `'Contact'` Swagger tag.
- `schema.prisma` — append enum + model.

### Unit specs (store-api)

- `contact.repository.spec.ts` — create defaults, list filter/pagination/skip,
  findById, partial update (status-only / both / empty), countByStatus.
- `contact.service.spec.ts` — create (persist + optional nulls), findAllAdmin
  (meta + unread), findByIdAdmin (404), status transitions, unreadCount.
- `contact.controller.spec.ts` — delegates + returns `{ id }` only; asserts the
  `@Throttle` metadata (5/60s) is wired on the public submit handler.

## Storefront wiring (`apps/store-client`)

- `entities/contact` barrel re-exports `useContactControllerSubmit` +
  `CreateContactMessageDto` from the generated client.
- `widgets/contact/ui/contact-form.tsx` — full form (topic chips + name/phone/
  email/orderRef/message + consent) via react-hook-form + a zod schema mirroring
  the DTO (`widgets/contact/model/contact-schema.ts`). Pending/disabled submit,
  success confirmation (reuses the existing panel), and a friendly UA error
  state: 429 → rate-limit copy, other failures → generic retry copy. Consent is
  a client-only gate (not sent). Stub note + "no network call" behaviour removed.
- `widgets/info-support/ui/info-contact-form.tsx` — the compact `/info` form,
  wired the same way (added a phone field to satisfy the DTO;
  `model/info-contact-schema.ts`).
- Dictionary: added `dict.contact.errors.*`, `submitting`, and `dict.info`
  `formPhone` / `formSubmitting` / `formError`; removed `dict.contact.stubNote`.
- Tests: a default MSW `POST /api/contact` handler; `contact-view.test.tsx`
  asserts a valid submit posts the expected body + shows the confirmation, a 429
  shows the rate-limit error, and empty required fields block submit with inline
  errors.

## Admin inbox (`apps/store-admin`)

- `entities/contact` barrel + `shared/api/index.ts` re-export of the generated
  contact client.
- `widgets/message-inbox/` — `MessageInbox` (URL-driven `?status`/`?page` filter
  - pagination, status badges, snippet, per-row **Open**), `MessageDetailDialog`
    (full contact info + orderRef + body; status actions mark READ / ARCHIVED /
    back-to-NEW; admin-note RHF form seeded via `values` per forms.md Rule 2a),
    `MessageInboxSkeleton`, and `status-meta` helpers.
- Route `app/(dashboard)/messages/` (`page.tsx` + `loading.tsx`).
- Sidebar: a `Повідомлення` nav entry with an unread (NEW) count `Badge` fed by
  `useAdminContactUnreadCount`.
- Dictionary: `nav.messages` + a `messages` section (UA).
- Tests (`message-inbox.test.tsx`): rows render; filter updates the URL param;
  Open → detail dialog → mark-read PATCHes `{ status: "READ" }`; note save
  PATCHes `{ adminNote }`; empty state.

## Contract / regen

Contract changed (**yes**) — new `Contact` tag + endpoints/models. Generated
clients (`**/shared/api/generated/**`, gitignored) were regenerated locally to
build/test against the new hooks; the orchestrator owns committing the regen and
running the migration.
