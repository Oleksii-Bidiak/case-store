# Plan 093 — Origin-side image pre-optimization (sharp WebP + LQIP) — TASK-091

> **Wave 3 / Stream A.** Backend upload-pipeline change + one additive Prisma migration +
> a thin storefront consumption change. Pairs with TASK-074 (already shipped: `next/image`
>
> - `remotePatterns` + shimmer placeholder) — this stream replaces the generic shimmer with a
>   real per-image blur placeholder and shrinks payloads by serving WebP.

## Problem

Uploaded product images are stored **as-is** (original JPEG/PNG, up to 5 MB) and served raw
from `/uploads/products/<uuid>.<ext>`. Consequences:

- Large transfer sizes on the storefront grid/PDP (no format optimization at the origin;
  `next/image` re-encodes on the fly but still fetches the full original first).
- The shimmer placeholder from TASK-074 is generic — there is no per-image LQIP, so the
  blur-up transition doesn't resemble the final image and CLS mitigation is weaker.

## Goal

On upload, **pre-process each accepted image with `sharp`**:

1. Re-encode to **WebP** (quality-capped) and store that as the served file (`.webp`).
2. Generate a **tiny blurred LQIP** (≈16–20 px wide WebP) as a base64 `data:` URI and persist
   it on the image row as `blurDataUrl`.
3. Surface `blurDataUrl` through the read entities so the storefront `next/image` can render
   `placeholder="blur" blurDataURL={…}`.

Non-goals (out of scope, tracked elsewhere): CDN offload, responsive multi-size renditions,
re-processing the existing seed images (a one-off backfill is a follow-up manual step).

## Architecture touchpoints

| Layer            | File                                                                                  | Change                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Schema           | `apps/store-api/prisma/schema.prisma`                                                 | `ProductImage.blurDataUrl String? @map("blur_data_url")`                          |
| Migration        | `add_image_blur_data_url`                                                             | additive, nullable — **this stream owns the only Wave-3 migration**               |
| Image processing | `apps/store-api/src/storage/` (new `ImageProcessor`)                                  | `sharp`-based: `toWebp(buffer)` + `toLqip(buffer)`                                |
| Service          | `product-image.service.ts`                                                            | run the processor before `storage.save`, store `.webp`, persist `blurDataUrl`     |
| Repository       | `product-image.repository.ts`                                                         | `CreateImageInput.blurDataUrl` written on `bulkCreate`                            |
| Entity           | `product-image.entity.ts`                                                             | expose `blurDataUrl: string \| null`                                              |
| Public read path | `PublicProductEntity` / product detail + list image mapping                           | carry `blurDataUrl` to the storefront                                             |
| Storefront       | `apps/store-client/src/shared/ui/product-card.tsx` (`ProductCardImage`) + PDP gallery | `placeholder="blur"` + `blurDataURL` when present, else keep the TASK-074 shimmer |

**Clean-architecture note:** `sharp` lives behind a small injectable `ImageProcessor`
(in `src/storage/`, same module as `LocalDiskStorageService`) so `ProductImageService` stays
free of the image library and the processor is mockable in unit tests. `IStorageService`
already takes `(buffer, ext)` — we pass the WebP buffer + `'webp'`, no interface change.

## Sub-tasks (TDD where logic is non-trivial)

- **TASK-091-A** — Schema + migration: add `blurDataUrl String?` to `ProductImage`; run
  `prisma migrate dev --name add_image_blur_data_url` (schema-only committed; SQL gitignored).
- **TASK-091-B** — `ImageProcessor` service (`src/storage/image-processor.service.ts`):
  `process(buffer): Promise<{ webp: Buffer; blurDataUrl: string }>`. WebP at quality ~80;
  LQIP = resize to ~16 px width, WebP q~40, `data:image/webp;base64,…`. Add `sharp` dep to
  `apps/store-api/package.json`. **Red→Green** unit spec with a real tiny fixture buffer
  (assert output is a valid WebP + `blurDataUrl` starts with `data:image/webp;base64,`).
- **TASK-091-C** — Wire the processor into `ProductImageService.uploadImages`: for each file,
  `const { webp, blurDataUrl } = await this.imageProcessor.process(file.buffer)`, then
  `storage.save(webp, 'webp')`, set `blurDataUrl` on the `CreateImageInput`. Update the unit
  spec (mock `ImageProcessor`) to assert `.webp` ext + `blurDataUrl` persisted + primary logic
  unchanged. Keep `ALLOWED_MIME_EXT` accepting the same input MIME types (input gif stays gif —
  skip animated-gif WebP conversion: if `file.mimetype === 'image/gif'` pass through unprocessed
  and leave `blurDataUrl` null, to avoid killing animation).
- **TASK-091-D** — Repository + entity: `ProductImageRepository.bulkCreate` writes `blurDataUrl`;
  `ProductImageEntity` exposes it (`@ApiProperty … nullable`), `fromPrisma` maps it. Update
  `findByProductId`/list/detail selects to include the new column.
- **TASK-091-E** — Public read path: add `blurDataUrl` to the product image shape returned on the
  **public** `GET /products` + `GET /products/:slug` (via `PublicProductEntity` image mapping) so
  the storefront receives it. Admin management responses already carry it via the entity.
- **TASK-091-F** — Orval regen: `swagger:export -w apps/store-api` → `generate:api` (both apps).
- **TASK-091-G** — Storefront consumption: `ProductCardImage` (and the PDP gallery `next/image`)
  render `placeholder="blur"` + `blurDataURL={image.blurDataUrl}` **only when present**; when
  null (gif or legacy seed image) fall back to the existing TASK-074 shimmer. RTL: a product with
  `blurDataUrl` renders `next/image` with the blur props; one without keeps the shimmer.
- **TASK-091-H** — Full stream gate (below).

## Acceptance criteria

- Uploading a JPEG/PNG stores a `.webp` file and persists a non-null `blurDataUrl` on the row.
- `GET /products/:slug` (public) returns image objects that include `blurDataUrl`.
- Storefront cards/PDP use the real blur placeholder when available; no regression when absent.
- Animated GIFs still upload and animate (passed through, `blurDataUrl` null).
- `store-api` unit + product-image e2e green; `store-client` RTL green; Orval clean (no drift);
  `build`/`lint`/`typecheck` green in all three workspaces.

## Verification

- `npm run test -w apps/store-api` (image-processor + product-image service specs) + product e2e.
- `npm run test -w apps/store-client` (ProductCardImage blur vs shimmer).
- Clean `swagger:export` + `generate:api` (generated files gitignored → regenerate on `develop`).
- **Pending manual QA (running stack):** upload a JPEG in admin → confirm a `.webp` lands in
  `/uploads/products/`, the storefront card shows a real blur-up, and payload is smaller than the
  original. Existing seed images (no `blurDataUrl`) still render via shimmer — note a follow-up
  backfill task if desired.

## Wave-3 integration notes

- **Only migration in Wave 3** → no migration mutex. Created schema-first on `develop` before the
  stream agent starts (agent must NOT edit `schema.prisma`; it consumes the regenerated client).
- Shared-file collisions: none with Stream B (Sentry) or Stream C (e2e fix). `product-image.*`,
  `storage/*`, and `ProductCardImage` are exclusive to this stream.
