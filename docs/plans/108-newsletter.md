# 108 — Newsletter subscriptions (TASK-188)

NEWSLETTER vertical of Етап 2. A public, idempotent email opt-in plus admin
list/export, wired into the storefront homepage and promo newsletter blocks.
Does NOT use the publishing pattern (plan 104) — subscriptions are not published
content.

Status: implemented + tested. store-api unit green (19 new); store-client
typecheck + lint + targeted tests green (5 new feature + updated promo-view);
store-admin typecheck + lint + targeted tests green (5 new). Migration + Orval
regen run against `store_dev`.

Three commits on `feature/188-newsletter`: backend → storefront wiring → admin
list/export.

---

## Data model

Appended to `apps/store-api/prisma/schema.prisma`:

```prisma
enum NewsletterStatus { SUBSCRIBED UNSUBSCRIBED }

model NewsletterSubscription {
  id             String           @id @default(uuid())
  email          String           @unique
  status         NewsletterStatus @default(SUBSCRIBED)
  source         String?
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  unsubscribedAt DateTime?        @map("unsubscribed_at")

  @@index([status])
  @@map("newsletter_subscriptions")
}
```

- `email` is `@unique` and stored normalized (trimmed + lowercased at the DTO
  boundary and defensively in the service).
- UNSUBSCRIBED rows are kept (never deleted) so a re-subscribe re-activates the
  same row and preserves history / `unsubscribedAt`.

---

## Backend — `apps/store-api/src/newsletter/` (Clean Architecture)

Controller → service → repository; the service never touches Prisma. Response
envelope `{ data }` / `{ data, meta }`. Registered in `app.module.ts`; `'Newsletter'`
Swagger tag added to BOTH `src/main.ts` and `src/export-swagger.ts`.

### Endpoints

| Method + path                       | Guard      | Notes                                                                                              |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/newsletter/subscribe`    | public     | `@Throttle 5/min`; body `{ email, source? }`; idempotent; returns `{ data: { subscribed: true } }` |
| `POST /api/newsletter/unsubscribe`  | public     | `@Throttle 5/min`; body `{ email }`; idempotent; returns `{ data: { unsubscribed: true } }`        |
| `GET  /api/newsletter/admin`        | AdminGuard | list; `?status`, `?search` (email, case-insensitive), `?page`, `?limit`; `{ data, meta }`          |
| `GET  /api/newsletter/admin/export` | AdminGuard | CSV `email,status,source,createdAt`; `Content-Type: text/csv` + `Content-Disposition: attachment`  |

### Idempotency (the core rule)

`NewsletterRepository.subscribe` is a Prisma `upsert` keyed on the unique `email`:

- new address → create SUBSCRIBED row with `source`;
- existing address (SUBSCRIBED **or** UNSUBSCRIBED) → force `status =
SUBSCRIBED`, clear `unsubscribedAt`. `source` is only overwritten when a new
  one is supplied (original attribution preserved otherwise).

No duplicate row is ever created and re-subscribing never errors. `unsubscribe`
returns `null` for an unknown email so the service treats it as a silent success
(never reveals whether an address was on record).

### CSV

Built in the service (`exportCsv`) as a pure mapping — header + one line per row,
RFC-4180 quote-escaping for values containing commas/quotes/newlines, `\r\n` line
endings. The admin controller streams it via `@Res()` with the CSV headers.

### Unit specs (19, all green)

- repository: idempotent upsert (create + re-activate, source-preservation),
  unsubscribe (found + unknown), list filter/search/pagination, export query.
- service: email normalization, idempotency, CSV row mapping (blank source,
  quote-escaping).
- controller: `{ data }` envelope, `@Throttle` metadata wired (5/min), CSV
  attachment + `text/csv` headers.

---

## Storefront — reusable feature + wiring

### `apps/store-client/src/features/newsletter-subscribe/`

Reusable `NewsletterSubscribeForm` (client component):

- email input + submit; pending/disabled, success (reinforces "−10% first
  order"), and error states (429 → dedicated rate-limit message, else generic);
- zod email validation (`newsletterSchema`, trims + lowercases);
- Orval mutation `useNewsletterControllerSubscribe` (re-exported via new
  `entities/newsletter`);
- accessible: `sr-only` label, single `aria-live` status region, `aria-invalid`;
- design tokens only; accepts `source` + `className`/`inputClassName`/
  `buttonClassName` so hosts match their block visually.

Dict strings under `dict.newsletterForm` (shared/config).

### Wiring

- `widgets/newsletter/ui/newsletter.tsx` — added the form to the existing "−10%
  first order" section (`source="home"`); social links untouched.
- `widgets/promo/ui/promo-newsletter.tsx` — replaced the local demo stub with
  the real feature (`source="promo"`); updated `promo-view.test.tsx` to assert
  the live subscribe flow.

Tests (5 new + 1 updated): valid subscribe + normalization/source forwarding,
idempotent repeat, client-side validation blocks the request, 429 rate-limit
message.

### Blog-newsletter follow-up (collision boundary)

`widgets/blog/ui/blog-newsletter.tsx` is owned by the blog vertical and was NOT
touched. Adopting `NewsletterSubscribeForm` there (with `source="blog"`) is a
small follow-up left to the blog vertical/owner — the feature is already reusable.

---

## Admin — subscribers list + export

- Route `apps/store-admin/src/app/(dashboard)/subscribers/` (`page.tsx` +
  `loading.tsx`).
- Widget `widgets/subscriber-list/` — `AdminSubscriberTable` (email, status
  badge, source, date; status filter + email search + pagination, all in the
  URL) and a skeleton. "Export CSV" button calls the generated
  `adminNewsletterControllerExport` fetcher and triggers a file download via the
  extracted `model/download-csv.ts` helper. Orval hooks re-exported via new
  `entities/newsletter`.
- Sidebar entry (`nav.subscribers`, `Mail` icon) in `admin-shell/admin-sidebar.tsx`.
- UA strings under `dict.subscribers` + `dict.nav.subscribers`.

Tests (5 new): rows render, empty state, status filter → URL, CSV export
triggers the endpoint + download, download-csv helper unit.

---

## Shared files touched (additive-merge awareness)

- `apps/store-api/prisma/schema.prisma` (enum + model appended)
- `apps/store-api/src/app.module.ts`, `src/main.ts`, `src/export-swagger.ts`
- `apps/store-client/src/entities/index.ts`, `src/features/index.ts`,
  `src/shared/config/dictionary.ts`
- `apps/store-admin/src/entities/index.ts`, `src/widgets/index.ts`,
  `src/shared/api/index.ts`, `src/shared/config/dictionary.ts`,
  `src/widgets/admin-shell/admin-sidebar.tsx`

## Contract change

Yes — new `Newsletter` tag and 4 operations. Orval hooks regenerated in both
frontends (generated files remain git-ignored, not committed).
