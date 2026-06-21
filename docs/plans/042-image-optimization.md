# Plan 042 — Image Optimization: `next/image` for Self-Hosted Store-API Images

> **Status:** To Do
> **Phase:** Phase 5 — Polish & Production (performance sub-track)
> **Parent Task:** TASK-074
> **Created:** 2026-06-21
> **Last Updated:** 2026-06-21

---

## Overview

TASK-073 introduced local-disk image storage on `store-api` and wired `<img>` tags with
`eslint-disable @next/next/no-img-element` comments that explicitly deferred `next/image`
adoption to this task. This plan replaces every deferred `<img>` with `<Image>` from
`next/image`, configures `remotePatterns` in both `next.config.ts` files so Next.js
accepts the self-hosted API origin, chooses a pragmatic blur-placeholder strategy for
runtime remote URLs, and documents the exact `sizes` values per call-site.

**No backend changes are made.** No Orval regen is required. Storage stays on
`store-api` local disk.

---

## User Stories

1. As a shopper, I want product images to load with optimal resolution for my screen
   size so that pages feel fast on mobile and crisp on desktop.
2. As a shopper, I want a soft blur shimmer to appear instantly before the product
   image loads so that the layout does not shift and the experience feels polished.
3. As a developer, I want TypeScript and the Next.js build to pass without any
   `@next/next/no-img-element` suppressions so that the codebase is lint-clean.

---

## Scope and Key Decisions

### 2.1 Which workspaces are in scope?

**store-client — yes.** All three `<img>` tags that carry `no-img-element` suppress
comments need to move to `<Image>`:

| Call-site                      | File                                                                                | Current pattern                            |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| ProductCard primary image      | `apps/store-client/src/shared/ui/product-card.tsx` line 65                          | `<img ... loading="lazy">`                 |
| ProductImageGallery main image | `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` line 49 | `<img ... onError>`                        |
| ProductImageGallery thumbnail  | `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` line 81 | `<img ... onError>` (inside thumb buttons) |

**store-admin — no.** The `ProductImageManager` thumbnail (line 181) uses a bare
`<img>` inside an admin-only interface. The admin panel is not on the critical
performance path, and converting it introduces a dependency on `next/image`'s width/height
requirement with no clear user-facing benefit in this iteration. The existing
`eslint-disable-next-line @next/next/no-img-element` comment in `product-image-manager.tsx`
will be **updated** to reference this plan as the explicit deferral reason instead of
the stale TASK-074 wording, making it clear the decision is intentional and not an
oversight. A separate sub-task (TASK-074-E) covers this comment hygiene.

### 2.2 `images.remotePatterns` — how the API host is derived

The `NEXT_PUBLIC_API_URL` environment variable already exists in both next.config.ts
files and defaults to `http://localhost:3001` (matching `PUBLIC_BASE_URL` on the API
side). Image URLs stored in `ProductImage.url` take the form:

```
{PUBLIC_BASE_URL}/uploads/products/{uuid}.{ext}
```

which resolves to e.g. `http://localhost:3001/uploads/products/abc123.jpg` in dev.

`remotePatterns` in `next.config.ts` must whitelist exactly this origin. Because the
host, protocol, and port all vary by environment, the pattern is derived at config-build
time from `NEXT_PUBLIC_API_URL`:

```ts
// next.config.ts — store-client
import { URL } from "url";

const apiUrl = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
);

const nextConfig: NextConfig = {
  // ...existing env block...
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: apiUrl.hostname,
        port: apiUrl.port, // empty string means "any port" in Next.js
        pathname: "/uploads/**",
      },
    ],
  },
};
```

Parsing the URL at config time means a single env var controls dev (localhost:3001) and
production (e.g. `https://api.mystore.ua`) without duplicating host/port in separate
variables. The same pattern applies to `store-admin`'s `next.config.ts` **only if**
admin also migrates to `next/image` in a future task; for now only store-client needs
this block.

**Important caveat:** `next.config.ts` runs at build time (Node.js). Parsing
`NEXT_PUBLIC_API_URL` there is safe. The resulting `remotePatterns` are baked into the
build artifact — changing the API host requires a rebuild. Document this in the plan and
in a comment in the config.

### 2.3 Self-hosted optimization — the Next.js image optimizer proxies the origin

When `<Image src="http://localhost:3001/uploads/products/x.jpg" />` is used:

- In **development**: Next.js dev server proxies the request to `localhost:3001`, runs
  it through the built-in `sharp`-based image optimizer, and serves a resized/WebP
  response to the browser. This works transparently.
- In **`next build` + `next start`** (standalone or normal): same behaviour — the
  Next.js server acts as an optimization proxy.
- In **static export** (`output: "export"`): `next/image` optimization is disabled by
  default; `images.unoptimized: true` would be needed. This project uses a Node.js
  server, so static export is not in scope.

**Decision:** Accept the default Next.js image optimization proxy. It gives WebP/AVIF
conversion, responsive resizing, and `srcset` generation for free — a real LCP win for a
product-photo-heavy store — with rendered variants cached on the Next.js side (only the
first request per `(src, width, quality)` hits the origin).

**This works in both deployment topologies — mono and split — and does not need to
change when the project splits the frontend out later.** The reason: a product image URL
_must_ be publicly reachable, otherwise the user's browser could not display it. The
Next.js optimizer fetches that same public `src` with an ordinary server-side HTTPS
request, so **if the browser can load the image, the optimizer can too.** The often-cited
"optimizer can't reach the origin behind Docker isolation" failure only occurs if an
_internal-only_ hostname is placed in `src` — which this plan never does (`src` is always
the public `PUBLIC_BASE_URL` origin).

**Current state (mono):** `store-api` is already isolated in its own Docker container;
frontend containers are not yet defined and the deployment shape (mono-first, possibly
split later for maintainability) is still undecided. The optimized-`next/image` choice is
deliberately topology-agnostic so this decision does not block that call.

**Scaling lever — infrastructure, not code.** When image-optimization load on the Next.js
process becomes a concern (high traffic, or after splitting), the fix is infrastructural
and requires **no application changes**:

- Put a caching reverse-proxy / CDN in front of `/_next/image` (and ideally `/uploads/**`
  on store-api) so optimized renditions are served from cache, not recomputed.
- Or move optimization to the origin: have store-api pre-generate resized/WebP renditions
  on upload (`sharp`) and serve them directly — at which point Next.js `unoptimized: true`
  becomes appropriate. This is backend work, deferred to **TASK-091** (see §2.4 / Out of
  Scope).

**Escape hatch (documented, not enabled):** `images.unoptimized: true` is retained only
as a fallback for an unforeseen deployment edge case (e.g. an internal-only image host).
For public product images it disables useful optimization for no benefit, so it is **not**
the default and should not be set pre-emptively.

### 2.4 Blur placeholder strategy

`placeholder="blur"` on `<Image>` requires either:

1. **Static import** — Next.js auto-generates the blur hash at build time. Not
   applicable here; URLs are runtime values from the API.
2. **Explicit `blurDataURL`** — a base64-encoded tiny JPEG/PNG/WebP string that Next.js
   uses as the CSS background while the real image loads.
3. **`placeholder="empty"`** — shows nothing while loading (no blur, no shimmer).

**Per-image blur hash generation** (option A) is the genuinely polished approach — it is
the classic LQIP (Low Quality Image Placeholder) technique: a real, tiny, heavily-downscaled
version of _that specific image_ shown blurred while the full image loads. Done correctly
it is delivered **inline as a base64 `blurDataURL`** (no second network request — the
preview ships with the RSC/HTML payload, strictly better than fetching a separate tiny
file in parallel). The cost is server-side: the API must compute the downscaled base64
(`sharp`, ~8–16px) at upload time and store it on `ProductImage`. That is backend work not
done in TASK-073, deferred to **TASK-091**. When it lands, only the `blurDataURL` _value_
changes (constant → per-image value from the API response); no `<Image>` call-site
structure changes.

**Decision for this task: a shared inline base64 shimmer constant.**

A single 8x8-pixel neutral grey image encoded as a base64 data URL will be defined in
`apps/store-client/src/shared/ui/image-placeholder.ts` (or inline in the component as a
named constant). All `<Image>` call-sites in store-client pass
`placeholder="blur" blurDataURL={BLUR_PLACEHOLDER}`. This produces a consistent soft
shimmer effect without any per-image API work.

The constant is approximately 40–60 characters of base64 — it is small enough to inline.
A well-known neutral shimmer for this purpose:

```ts
// A 1x1 transparent grey pixel, base64-encoded.
// Replace with a product-aesthetic shimmer if desired.
export const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
```

This is intentionally minimal. A future task (when the API generates per-image blur
hashes on upload) can replace the single constant with per-image `blurDataURL` values
from the API response without changing any `<Image>` call-site structure.

### 2.5 Responsive `sizes` values per call-site

`sizes` tells the browser (and Next.js optimizer) what rendered CSS width to expect at
various viewport widths. Correct values prevent over-fetching full-resolution images for
small thumbnails.

#### ProductCard (grid listing)

The product grid currently uses:

- Mobile (< 640px `sm`): 1 column → card is ~100vw minus padding
- sm (640–1023px): 2 columns → ~50vw
- lg (1024px+): 4 columns → ~25vw

```tsx
sizes="(max-width: 639px) calc(100vw - 2rem),
       (max-width: 1023px) calc(50vw - 2rem),
       calc(25vw - 2rem)"
```

`fill` layout is appropriate here since the card has a fixed `aspect-square` container.
Use `fill` + `className="object-cover"` + wrap in a `position: relative` container.

#### ProductImageGallery — main image

The main image slot has `aspect-square w-full` inside a constrained content column.
At mobile it is ~100vw; at desktop the PDP layout is two-column so the image column is
roughly 50% of max-content-width (~640px max).

```tsx
sizes="(max-width: 767px) calc(100vw - 3rem),
       (max-width: 1279px) calc(50vw - 4rem),
       640px"
```

Use `fill` (the outer `<div>` already has `aspect-square w-full overflow-hidden`).

#### ProductImageGallery — thumbnails

Thumbnails render at `size-16` (4rem / 64px) fixed. Use fixed `width={64} height={64}`
(no `fill`):

```tsx
<Image
  src={image.url}
  alt={...}
  width={64}
  height={64}
  className="size-full object-cover"
  ...
/>
```

### 2.6 `onError` / fallback behaviour with `next/image`

Raw `<img>` supports `onError` directly. `next/image` `<Image>` also supports `onError`
as a prop (it is a standard React event handler). The existing fallback state pattern in
`ProductImageGallery` (a `failed` Record keyed by image ID) and `ProductCard` (a local
`imgError` boolean state) can be kept essentially unchanged — just swap `onError` from
the `<img>` to the `<Image>`. TypeScript types accept it.

**One difference:** `next/image` shows its own broken-image UI if the src fails before
`onError` fires (it displays the `alt` text). Because `onError` is also called, the
component can still switch to the `ProductThumb` fallback. This is acceptable behaviour.

For `ProductCard`, which currently has no client-side state (it is a Server Component
candidate), adding `onError` requires the component to be a Client Component. Evaluate:
`ProductCard` is already in `shared/ui` and rendered widely. Adding `"use client"` to it
would propagate client boundary. Preferred approach: extract a thin `ProductCardImage`
client sub-component that owns the `onError` state and renders the `<Image>` or
`<ProductThumb>`. The outer `ProductCard` stays a Server Component.

### 2.7 Call-sites enumerated

| ID   | File                                                                                    | Element                                  | Action                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| CS-1 | `apps/store-client/src/shared/ui/product-card.tsx` L65                                  | `<img>` + eslint-disable comment         | Extract `ProductCardImage` client component; convert to `<Image fill>` with `sizes`, `blurDataURL`, `onError→fallback` |
| CS-2 | `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` L49         | `<img>` (main) + eslint-disable comment  | Convert to `<Image fill sizes={...}>` with `blurDataURL`, `onError→markFailed`; keep `"use client"` already present    |
| CS-3 | `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` L81         | `<img>` (thumb) + eslint-disable comment | Convert to `<Image width={64} height={64}>` with `onError→markFailed`; same file as CS-2                               |
| CS-4 | `apps/store-admin/src/features/product-image-manager/ui/product-image-manager.tsx` L181 | `<img>` + eslint-disable comment         | Update comment text only — keep raw `<img>`, document admin deferral explicitly                                        |

### 2.8 Verification gate

No new backend work and no Orval regen are expected. The verification gate is:

1. `npm run typecheck -w apps/store-client` — zero errors
2. `npm run lint -w apps/store-client` — zero `@next/next/no-img-element` warnings or
   errors (all suppressions removed from CS-1, CS-2, CS-3)
3. `npm run lint -w apps/store-admin` — CS-4 comment updated but lint rule still
   suppressed (intentional); passes
4. `npm run build -w apps/store-client` — this is where a missing `remotePatterns` or
   wrong protocol/hostname would surface as a build-time error or runtime warning
5. `npm run build -w apps/store-admin` — unchanged, must still pass
6. Manual smoke test: start dev servers, confirm images load on product list + PDP, blur
   shimmer visible on slow connection (DevTools → Network → throttle), fallback renders
   when image URL is intentionally broken

---

## Architecture

### Module structure changes

```
apps/store-client/
  next.config.ts                        — UPDATE: add images.remotePatterns block
  src/
    shared/ui/
      image-placeholder.ts              — NEW: BLUR_PLACEHOLDER base64 constant
      product-card-image.tsx            — NEW: client sub-component (onError state)
      product-card.tsx                  — UPDATE: use <ProductCardImage> instead of <img>
      index.ts                          — UPDATE: export ProductCardImage (if needed by consumers)
    widgets/product-detail/ui/
      product-image-gallery.tsx         — UPDATE: <Image> for main + thumbs; import BLUR_PLACEHOLDER

apps/store-admin/
  src/features/product-image-manager/ui/
    product-image-manager.tsx           — UPDATE: comment text only (no structural change)
```

No backend files, no Prisma, no Orval.

---

## Tasks

---

### TASK-074-A: Configure `next/image` remote patterns in `store-client`

**Type:** chore (config)
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** —

**Context:**
`apps/store-client/next.config.ts` currently has no `images` block. Without it, any
`<Image src="http://localhost:3001/...">` throws a runtime error:
`Error: Invalid src prop ... hostname "localhost" is not configured under images.remotePatterns`.
This task adds the block, derived from `NEXT_PUBLIC_API_URL` so it works in all envs.

**Acceptance Criteria:**

- [ ] `next.config.ts` imports `URL` from `"url"` (Node built-in, type-safe)
- [ ] `const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")` computed before the config object
- [ ] `images.remotePatterns` array contains one entry: `{ protocol, hostname, port, pathname: "/uploads/**" }` all derived from `apiUrl`
- [ ] A comment explains that changing the API host requires a rebuild (build-time bake-in)
- [ ] `npm run build -w apps/store-client` completes without any `remotePatterns` error
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/next.config.ts` — add `images.remotePatterns` block

---

### TASK-074-B: Create `BLUR_PLACEHOLDER` constant in `shared/ui`

**Type:** chore
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** —

**Context:**
`next/image` with `placeholder="blur"` on a remote image requires an explicit
`blurDataURL`. A shared constant avoids duplicating the base64 string across components
and makes it easy to swap in a better shimmer image later.

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/ui/image-placeholder.ts` created with a named export
      `BLUR_PLACEHOLDER: string` — a valid base64 data URL (data:image/...)
- [ ] The constant is a 1x1 or small neutral-grey pixel; a comment explains the deferral
      of per-image blur hashes to a future task (when API generates them on upload)
- [ ] `apps/store-client/src/shared/ui/index.ts` (barrel) re-exports `BLUR_PLACEHOLDER`
      (or it is exported directly from the file and imported by path — either is acceptable)
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/image-placeholder.ts` — new constant file
- `apps/store-client/src/shared/ui/index.ts` — add export if barrel-exporting

---

### TASK-074-C: Extract `ProductCardImage` client sub-component; convert to `<Image>`

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-074-A, TASK-074-B

**Context:**
`ProductCard` (CS-1) is in `shared/ui` and is potentially a Server Component. Adding
`onError` state directly would require making the entire card a Client Component,
propagating the boundary unnecessarily. The solution is a thin `ProductCardImage`
Client Component that owns the single boolean state for image error and renders either
`<Image>` or `<ProductThumb>`. `ProductCard` imports it and stays server-side.

The existing `eslint-disable-next-line @next/next/no-img-element` comment and the
`// next/image optimization + remote-host config deferred to TASK-074.` comment in
`product-card.tsx` are both removed in this task.

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/ui/product-card-image.tsx` created with `"use client"` directive
- [ ] `ProductCardImage` props: `src: string`, `alt: string`, `gradient: string`
      (the `pickProductGradient` result, passed in so the parent keeps the same gradient logic),
      `priority?: boolean` (default `false`) — forwarded to `<Image priority>` for above-the-fold LCP cards
- [ ] Renders: when not errored → `<Image fill sizes="..." placeholder="blur" blurDataURL={BLUR_PLACEHOLDER} priority={priority} onError={...} className="absolute inset-0 ... object-cover">`;
      when errored → the gradient initial/icon placeholder markup (copied from current `ProductCard`)
- [ ] `sizes` value: `"(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), calc(25vw - 2rem)"` (see §2.5)
- [ ] `product-card.tsx` updated: replaces the conditional `product.primaryImage ? <img> : <div>` block
      with `<ProductCardImage src={product.primaryImage?.url ?? ""} alt={...} gradient={gradient} priority={priority} />`
      where the parent-level `product.primaryImage` presence check is moved inside `ProductCardImage`
      (no src → renders gradient directly without an `<Image>` attempt)
- [ ] **LCP priority threading:** `ProductCard` gains an optional `priority?: boolean` prop forwarded to
      `ProductCardImage`. The grid/list widget that maps products to `<ProductCard>` (e.g. the product
      listing widget in `apps/store-client/src/widgets/`) passes `priority={index < 4}` so the first
      row (4 cards on desktop) loads eagerly without lazy-load delay; cards beyond the first row keep
      the default lazy behaviour. Locate the actual mapping call-site during implementation and thread
      the prop there.
- [ ] Both `eslint-disable` comments in `product-card.tsx` (the block comment and the inline
      `// next/image ... TASK-074` comment) are removed
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes — zero `no-img-element` warnings from this file

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card-image.tsx` — new client component
- `apps/store-client/src/shared/ui/product-card.tsx` — swap `<img>` for `<ProductCardImage>`; add `priority` prop; remove eslint-disable comments
- the product-grid/listing widget under `apps/store-client/src/widgets/` that maps products to `<ProductCard>` — pass `priority={index < 4}` for the first row (locate during implementation)

---

### TASK-074-D: Convert `ProductImageGallery` main image + thumbnails to `<Image>`

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-074-A, TASK-074-B

**Context:**
`ProductImageGallery` (CS-2, CS-3) is already `"use client"` with `onError` state
managed via the `failed` Record. Both `<img>` elements can be converted to `<Image>` in
place — the `onError` prop works identically. The two eslint-disable comments are
removed. The existing `ProductThumb` fallback paths are kept unchanged.

The outer container for the main image (`<div className="aspect-square w-full overflow-hidden ...">`)
needs `position: relative` for `fill` layout (`next/image fill` requires the parent to
have `position: relative` or `relative` Tailwind class). Verify this is already present
or add it.

Thumbnail buttons (`<button className="size-16 ...">`) also need `position: relative`
if thumbnails use `fill`; however, given fixed 64x64 px size, fixed `width`/`height`
props are cleaner (no need for `fill`).

**Acceptance Criteria:**

- [ ] Main `<Image>` (CS-2):
  - `fill` prop set
  - `sizes="(max-width: 767px) calc(100vw - 3rem), (max-width: 1279px) calc(50vw - 4rem), 640px"` (see §2.5)
  - `placeholder="blur" blurDataURL={BLUR_PLACEHOLDER}`
  - `priority` set — the PDP main image is the above-the-fold LCP element, so it loads
    eagerly (no lazy-load). Thumbnails (CS-3) stay lazy (default).
  - `onError={() => markFailed(activeImage.id)}` preserved
  - `className="size-full object-cover"` preserved
  - Parent container has Tailwind `relative` class confirmed
- [ ] Thumbnail `<Image>` (CS-3):
  - `width={64} height={64}` fixed dimensions (no `fill`)
  - `onError={() => markFailed(image.id)}` preserved
  - `className="size-full object-cover"` preserved
  - No `placeholder="blur"` needed on tiny 64px thumbnails (the placeholder shimmer
    would barely be visible; omitting reduces attribute noise). Document this decision
    with an inline comment.
- [ ] Both `eslint-disable-next-line @next/next/no-img-element` comments removed
- [ ] `import Image from "next/image"` added at the top of the file
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes — zero `no-img-element` suppression from this file
- [ ] Unit test in `product-image-gallery.test.ts` (created in TASK-073-I) still passes without modification

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` — convert both `<img>` to `<Image>`; remove eslint-disable comments

---

### TASK-074-E: Update admin `ProductImageManager` eslint comment to document intentional deferral

**Type:** chore (comment hygiene)
**Scope:** store-admin
**Complexity:** S (15min)
**TDD Required:** No
**Depends on:** —

**Context:**
`product-image-manager.tsx` line 181 has a bare `{/* eslint-disable-next-line @next/next/no-img-element */}`
with no explanation. The JSDoc comment on the component (line 41) references "TASK-074"
as the deferral. Now that TASK-074 is in progress and has explicitly decided NOT to
convert the admin thumbnails in this iteration, update both comments to state the
rationale clearly — prevents future developers from assuming it was accidentally skipped.

**Acceptance Criteria:**

- [ ] The inline `eslint-disable-next-line` comment updated to include an explanation:
      `{/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails: next/image deferred; fixed dimensions unavailable without layout measurement; see docs/plans/042-image-optimization.md §2.1 */}`
- [ ] The JSDoc on `ProductImageManager` updated: remove "deferred to TASK-074" and
      replace with "admin thumbnails kept as <img>; see plan 042 §2.1 for rationale"
- [ ] `npm run lint -w apps/store-admin` passes

**Files to create/modify:**

- `apps/store-admin/src/features/product-image-manager/ui/product-image-manager.tsx` — comment updates only

---

### TASK-074-F: Verification gate — typecheck + lint + build across both frontends + manual smoke test

**Type:** chore (verification)
**Scope:** store-client, store-admin
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-074-A through TASK-074-E

**Context:**
Next.js build is the authoritative gate for `remotePatterns` misconfig. Lint is the gate
for stray `no-img-element` suppressions. Both must be green before closing TASK-074.

**Acceptance Criteria:**

- [ ] `npm run typecheck -w apps/store-client` — zero errors
- [ ] `npm run typecheck -w apps/store-admin` — zero errors
- [ ] `npm run lint -w apps/store-client` — zero `@next/next/no-img-element` errors or
      unsuppressed warnings; no other new lint issues
- [ ] `npm run lint -w apps/store-admin` — passes; the one remaining `no-img-element`
      in `product-image-manager.tsx` is suppressed with a descriptive comment (TASK-074-E)
- [ ] `npm run build -w apps/store-client` — succeeds without `remotePatterns` errors
- [ ] `npm run build -w apps/store-admin` — succeeds unchanged
- [ ] `npm run test -w apps/store-client` — all existing unit tests green (including the
      `product-image-gallery.test.ts` altText tests from TASK-073-I)
- [ ] Manual smoke test (dev mode):
  - Product list page: images load, blur shimmer briefly visible on slow network,
    gradient placeholder renders for products without images
  - PDP: main image loads with blur shimmer, thumbnail clicks swap main image,
    broken URL triggers `ProductThumb` fallback
  - No browser console errors referencing `remotePatterns`, `hostname`, or `no-img-element`
- [ ] `git diff -- "**/shared/api/generated/**"` is empty (no Orval regen occurred)

**Files to create/modify:**

- No files modified — this is a verification-only task

---

## Dependency Graph

```
TASK-074-A (remotePatterns config)    TASK-074-B (BLUR_PLACEHOLDER constant)
         \                                      /
          +---- TASK-074-C (ProductCardImage) --+
          |
          +---- TASK-074-D (ProductImageGallery) --+
                                                    |
TASK-074-E (admin comment hygiene) ----------------+
                                                    |
                                        TASK-074-F (verification gate)
```

TASK-074-A and TASK-074-B have no mutual dependency and can proceed in parallel.
TASK-074-C and TASK-074-D both depend on A and B but are independent of each other.
TASK-074-E is fully independent and can be done any time.
TASK-074-F depends on all preceding sub-tasks.

---

## Out of Scope (deferred)

| Item                                                                            | Rationale                                                                                                                                                                                                                                   | Future task                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| External CDN / object storage (S3, Cloudinary, Vercel Blob)                     | Hard constraint from user; storage abstraction in `StorageService` already supports a future swap                                                                                                                                           | Future plan (post-Phase 5)                    |
| Per-image blur hash / `blurDataURL` (LQIP) generation on upload                 | Requires API-side image processing (`sharp`) at upload time; the shared shimmer constant is the right short-term solution. Swapping in per-image values later changes only the `blurDataURL` prop value, not call-site structure (see §2.4) | **TASK-091**                                  |
| Origin-side image pre-optimization (store-api `sharp` resize + WebP renditions) | The scaling lever for when Next.js optimizer load becomes a concern; enables `images.unoptimized` on the frontend. Pairs naturally with per-image LQIP generation (same `sharp` pipeline)                                                   | **TASK-091**                                  |
| Variant-level images                                                            | Deferred from TASK-073; no variant image data in API                                                                                                                                                                                        | Future plan                                   |
| Admin `ProductImageManager` `next/image` conversion                             | Intentional deferral — admin is not performance-critical; fixed dimensions unavailable from layout context; see §2.1                                                                                                                        | Future admin polish task                      |
| `images.unoptimized: true` as default                                           | Kept as a documented fallback only; the optimization proxy is the correct default                                                                                                                                                           | Not needed unless deployment issues arise     |
| Store-admin `remotePatterns` config                                             | Admin is not converting to `next/image` in this iteration                                                                                                                                                                                   | Added alongside admin `next/image` conversion |
| Image compression / resizing on upload                                          | Upload pipeline concern, not frontend                                                                                                                                                                                                       | Future API task                               |

---

## Risks and Mitigations

| Risk                                                                                      | Likelihood | Mitigation                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `next/image` optimization proxy adds noticeable latency when API is on same host          | Low        | The optimizer caches results; only the first request per size hits the origin. Acceptable.                                            |
| `remotePatterns` baked at build time breaks hot-switching API URL at runtime              | Low        | Documented in config comment; team knows a rebuild is required for host changes                                                       |
| `onError` on `<Image>` fires after Next.js already displays its own broken-image fallback | Low        | User sees the broken icon briefly then `ProductThumb` renders; acceptable UX. The window is small because `onError` fires immediately |
| Shared `BLUR_PLACEHOLDER` grey shimmer does not match product image aesthetic             | Low        | It is a single-file constant easily replaced with a branded shimmer; no call-sites change                                             |
| `ProductCard` Server Component boundary broken by extracting `ProductCardImage`           | Low        | Only `ProductCardImage` is `"use client"`; `ProductCard` remains server-renderable; boundary is correctly scoped                      |
| Thumbnail images in `ProductImageGallery` do not have blur placeholder                    | Accepted   | Thumbnails are 64px; the shimmer duration is imperceptible at that size. Document in code                                             |

---

## Notes

- **No backend changes.** The API continues to serve `/uploads/products/<file>` exactly
  as built in TASK-073. No migration, no Orval regen, no seed changes.
- **LCP `priority`.** The cheapest perceived-speed win in this plan, ahead of any blur
  strategy: mark above-the-fold images with `priority` so Next.js loads them eagerly
  instead of lazily. Applied to the PDP main image (TASK-074-D) and the first row of grid
  cards (`index < 4`, TASK-074-C). Everything below the fold keeps the default lazy load.
  Avoid over-applying `priority` — marking too many images eager defeats the purpose and
  can hurt LCP.
- **`ProductCard` server/client boundary:** The existing file has no `"use client"` directive.
  Extracting `ProductCardImage` as a separate Client Component is the minimal-invasive
  approach. If a future refactor makes the entire card interactive (e.g. quick-add
  overlay from TASK-086), merge `ProductCardImage` back into `ProductCard` at that point.
- **`sizes` values are estimates** based on the current Tailwind grid layout. If the grid
  breakpoints change in a future redesign, update `sizes` accordingly. Incorrect `sizes`
  do not break anything — they only affect which resolution the optimizer picks.
- **`next/image` and `fill` require the parent to have `position: relative` (or `relative` Tailwind class).** Both the card image container and the gallery main image container already
  have `overflow-hidden` — confirm `relative` is present or add it during TASK-074-C/D.
- The `eslint-disable` comment in `product-image-gallery.tsx` currently reads
  `-- Next <Image> deferred to Phase 5 (needs dimensions + CDN)`. This is now inaccurate
  (no CDN needed, fill layout solves dimensions). Remove the comment entirely when
  converting (TASK-074-D) — the clean `<Image>` usage needs no suppression.
