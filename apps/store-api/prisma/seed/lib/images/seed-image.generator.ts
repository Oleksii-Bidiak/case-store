/**
 * The seed-image renderer (plan 170, TASK-365).
 *
 * Generates the demo catalogue's imagery locally instead of borrowing a
 * third-party placeholder host: an SVG (gradient + plinth + icon) is rasterised
 * with `sharp`,
 * handed to the very same {@link ImageProcessor} that processes real admin
 * uploads, and written into `UPLOAD_DEST/products/` under a content-derived
 * name. The result is byte-identical in shape to a genuine upload — WebP q80, a
 * base64 LQIP on the row, and a `${PUBLIC_BASE_URL}/uploads/products/<file>`
 * URL — so the storefront's `next/image` allowlist, the blur-up placeholder and
 * the admin thumbnail all work on seeded data with no special-casing. It also
 * works with no network at all.
 *
 * THE EXPORTED SIGNATURES ARE THE FROZEN CONTRACT (TASK-363): the seeders call
 * them and must not change.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

import { ImageProcessor } from '../../../../src/storage/image-processor.service';
import { PRODUCTS_SUBDIR } from '../../../../src/storage/storage-subdirs';
import { ICON_STROKE_WIDTH, ICON_VIEWBOX, iconMarkup } from './icon-paths';
import { PALETTES, type PaletteId } from './palettes';
import type { IconId } from './icon-set';

export type { IconId } from './icon-set';
export type { PaletteId } from './palettes';

export interface SeedImageRequest {
  /** Stable identity of the image — today the position slug. */
  key: string;
  iconId: IconId;
  paletteId: PaletteId;
  shape: 'product' | 'category';
  sortOrder: number;
  alt: string;
}

export interface SeedImageRef {
  url: string;
  alt: string;
  blurDataUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Product gallery images. Matches what the admin upload pipeline typically gets. */
const PRODUCT_SIZE = 800;

/**
 * Category tiles. `CategoryTileImage` declares a 256 px intrinsic, so 512 is the
 * 2× retina render of exactly that box.
 */
const CATEGORY_SIZE = 512;

/** Fraction of the canvas the icon spans: smaller on a product (it sits on a plinth). */
const ICON_SPAN = { product: 0.46, category: 0.52 } as const;

/**
 * Supersampling factor for the SVG raster. libvips renders an SVG with explicit
 * pixel dimensions at `size × dpi/72`, so 300 dpi gives a ~4.2× oversample that
 * is then resized down — which is what keeps the thin icon strokes and the
 * plinth's rounded corners clean instead of stair-stepped.
 */
const RASTER_DENSITY = 300;

/**
 * How a render varies with `sortOrder`, so a three-image gallery is three
 * visibly different pictures rather than the same file listed three times. The
 * cycle repeats past its length — two sort orders that land on the same variant
 * are the same picture, and therefore (by design) the same file on disk.
 */
const VARIANTS = [
  { angle: 140, rotate: 0, scale: 1, accent: -1 },
  { angle: 205, rotate: -9, scale: 0.92, accent: 0 },
  { angle: 65, rotate: 11, scale: 1.05, accent: 1 },
  { angle: 320, rotate: -4, scale: 0.88, accent: 2 },
] as const;

/** Decorative translucent discs, in canvas fractions. Indexed by `Variant.accent`. */
const ACCENTS = [
  { cx: 0.82, cy: 0.2, r: 0.3, opacity: 0.16 },
  { cx: 0.16, cy: 0.84, r: 0.36, opacity: 0.14 },
  { cx: 0.5, cy: 0.06, r: 0.28, opacity: 0.18 },
] as const;

// ─── Output location ────────────────────────────────────────────────────────

/** Only ever matches this generator's own output — see {@link pruneSeedImages}. */
const SEED_FILE_RE = /^seed-[0-9a-f]{16}\.webp$/;

/** Mirrors `ProductImageService`: the URL path ServeStaticModule serves UPLOAD_DEST at. */
const PUBLIC_UPLOADS_PREFIX = '/uploads/';

/** Mirrors the `PUBLIC_BASE_URL` fallback in `src/config/env.validation.ts`. */
const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:3001';

/** Same default and resolution as `LocalDiskStorageService` (cwd is `apps/store-api`). */
function uploadRoot(): string {
  return resolve(process.env.UPLOAD_DEST ?? './uploads');
}

let baseUrl: string | undefined;

/**
 * The origin baked into every seeded image URL, resolved and announced once.
 *
 * Logging it is not decoration: the storefront's `next/image` allowlist is built
 * from `NEXT_PUBLIC_API_URL` **at build time**, and `localhost` is not the same
 * origin as `127.0.0.1` to that allowlist. When tiles mysteriously fall back to
 * icons, this line is the first thing to compare against the storefront's env.
 *
 * Production throws rather than defaulting: baking `http://localhost:3001` into
 * a staging database produces rows that are broken everywhere except the machine
 * that seeded them, and nothing about the failure points back here.
 */
function publicBaseUrl(): string {
  if (baseUrl !== undefined) return baseUrl;

  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed images: PUBLIC_BASE_URL must be set when NODE_ENV=production — refusing to ' +
        `bake "${DEFAULT_PUBLIC_BASE_URL}" into image URLs that would then be broken everywhere.`,
    );
  }

  baseUrl = configured || DEFAULT_PUBLIC_BASE_URL;
  console.log(
    `  ℹ Seed images: ${baseUrl}${PUBLIC_UPLOADS_PREFIX}${PRODUCTS_SUBDIR}/ → ${uploadRoot()}`,
  );
  return baseUrl;
}

// ─── SVG authoring ──────────────────────────────────────────────────────────

/** One fully-resolved render recipe. Its JSON *is* the cache key and the filename seed. */
interface RenderSpec {
  size: number;
  plinth: boolean;
  angle: number;
  from: string;
  to: string;
  fg: string;
  icon: IconId;
  rotate: number;
  scale: number;
  accent: number;
}

function specFor(req: SeedImageRequest): RenderSpec {
  const variant = VARIANTS[Math.abs(Math.trunc(req.sortOrder)) % VARIANTS.length];
  const palette = PALETTES[req.paletteId];
  if (!palette) {
    throw new Error(`Seed images: unknown palette "${req.paletteId}" for key "${req.key}"`);
  }
  const isProduct = req.shape === 'product';
  return {
    size: isProduct ? PRODUCT_SIZE : CATEGORY_SIZE,
    plinth: isProduct,
    angle: variant.angle,
    from: palette.from,
    to: palette.to,
    fg: palette.fg,
    icon: req.iconId,
    rotate: variant.rotate,
    scale: variant.scale * ICON_SPAN[req.shape],
    accent: variant.accent,
  };
}

/**
 * CSS gradient angle → SVG `linearGradient` endpoints in objectBoundingBox units.
 * 0° points to the top and angles run clockwise, so the direction vector in SVG's
 * y-down space is `(sin θ, −cos θ)`; the line is stretched by `|sin θ| + |cos θ|`
 * so the ramp still covers the corners of the box, exactly as CSS does it.
 */
function gradientVector(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2;
  const round = (n: number) => Number(n.toFixed(4));
  return {
    x1: round(0.5 - dx * half),
    y1: round(0.5 - dy * half),
    x2: round(0.5 + dx * half),
    y2: round(0.5 + dy * half),
  };
}

function buildSvg(spec: RenderSpec): string {
  const { size } = spec;
  const { x1, y1, x2, y2 } = gradientVector(spec.angle);

  const accent =
    spec.accent >= 0
      ? (() => {
          const a = ACCENTS[spec.accent];
          return `<circle cx="${a.cx * size}" cy="${a.cy * size}" r="${a.r * size}" fill="#ffffff" fill-opacity="${a.opacity}"/>`;
        })()
      : '';

  // The plinth is the "product on a pedestal" cue that separates a product shot
  // from a full-bleed category tile; category tiles deliberately have none.
  const plinth = spec.plinth
    ? (() => {
        const side = size * 0.68;
        const offset = (size - side) / 2;
        return `<rect x="${offset}" y="${offset}" width="${side}" height="${side}" rx="${size * 0.14}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.22" stroke-width="${size * 0.006}"/>`;
      })()
    : '';

  // translate → rotate → scale → recentre the 24×24 grid on the origin.
  const unit = (size * spec.scale) / ICON_VIEWBOX;
  const half = ICON_VIEWBOX / 2;
  const transform = `translate(${size / 2} ${size / 2}) rotate(${spec.rotate}) scale(${unit.toFixed(4)}) translate(${-half} ${-half})`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><linearGradient id="bg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${spec.from}"/><stop offset="1" stop-color="${spec.to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${size}" height="${size}" fill="url(#bg)"/>` +
    accent +
    plinth +
    `<g transform="${transform}" fill="none" stroke="${spec.fg}" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">` +
    iconMarkup(spec.icon) +
    `</g></svg>`
  );
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const processor = new ImageProcessor();

interface RenderedImage {
  url: string;
  blurDataUrl: string;
}

/**
 * Per-run memo, keyed on the render recipe. The catalogue reuses a handful of
 * icon × palette combinations across ~180 positions, so without this the seed
 * would encode the same picture dozens of times.
 */
const rendered = new Map<string, Promise<RenderedImage>>();

/** Basenames written during this run — the survivor set {@link pruneSeedImages} keeps. */
const writtenThisRun = new Set<string>();

function render(spec: RenderSpec): Promise<RenderedImage> {
  const recipe = JSON.stringify(spec);
  const cached = rendered.get(recipe);
  if (cached) return cached;

  const pending = (async (): Promise<RenderedImage> => {
    const png = await sharp(Buffer.from(buildSvg(spec)), { density: RASTER_DENSITY })
      .resize(spec.size, spec.size, { fit: 'fill' })
      .png()
      .toBuffer();

    // The same processor the real upload path uses: WebP q80 + a 16 px LQIP.
    const { webp, blurDataUrl } = await processor.process(png);

    // Content-derived name: identical recipes overwrite identical bytes, so
    // re-seeding never accumulates files and never invalidates a cached URL.
    const filename = `seed-${createHash('sha1').update(recipe).digest('hex').slice(0, 16)}.webp`;
    const dir = join(uploadRoot(), PRODUCTS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), webp);
    writtenThisRun.add(filename);

    return {
      url: `${publicBaseUrl()}${PUBLIC_UPLOADS_PREFIX}${PRODUCTS_SUBDIR}/${filename}`,
      blurDataUrl,
    };
  })();

  rendered.set(recipe, pending);
  return pending;
}

/** Render one image per request, in request order. Sort order 0 is the cover. */
export async function renderSeedImages(reqs: SeedImageRequest[]): Promise<SeedImageRef[]> {
  const refs: SeedImageRef[] = [];
  for (const req of reqs) {
    const { url, blurDataUrl } = await render(specFor(req));
    refs.push({
      url,
      alt: req.alt,
      blurDataUrl,
      sortOrder: req.sortOrder,
      isPrimary: req.sortOrder === 0,
    });
  }
  return refs;
}

/**
 * Render one category tile and return its URL, or null if it could not be made.
 *
 * Null rather than throw: a missing tile degrades to the storefront's icon +
 * gradient fallback, which is a cosmetic loss, and taking the whole seed down
 * over one unrenderable picture is worse. Tiles share the `products/` directory
 * with product images on purpose — both storefront allowlists match on the
 * `/uploads/` prefix, not the sub-directory (plan 170 §6).
 */
export async function renderCategoryTile(req: SeedImageRequest): Promise<string | null> {
  try {
    const { url } = await render(specFor({ ...req, shape: 'category' }));
    return url;
  } catch (error) {
    console.warn(
      `  ⚠ Seed images: could not render tile for "${req.key}": ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * Delete seed-generated image files that this run did not write, and report how
 * many went. Without it a renamed category or a dropped product would leave its
 * old picture on disk for ever.
 *
 * It cannot touch a real upload: the filter is this generator's own
 * `seed-<16 hex>.webp` naming, while `LocalDiskStorageService.save()` names every
 * uploaded file `${randomUUID()}.${ext}` — a 36-character hyphenated UUID, which
 * that pattern can never match.
 *
 * If nothing was rendered this run the pass is skipped entirely. "No images were
 * requested" and "the seam was never exercised" look identical from here, and
 * only one of them means the files on disk are orphans.
 */
export async function pruneSeedImages(): Promise<number> {
  if (writtenThisRun.size === 0) return 0;

  const dir = join(uploadRoot(), PRODUCTS_SUBDIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0; // Nothing has ever been written here.
  }

  let removed = 0;
  for (const name of entries) {
    if (!SEED_FILE_RE.test(name) || writtenThisRun.has(name)) continue;
    await unlink(join(dir, name));
    removed++;
  }
  return removed;
}
