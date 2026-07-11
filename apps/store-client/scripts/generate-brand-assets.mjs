#!/usr/bin/env node
/**
 * Brand asset generator (plan 145 / TASK-279-A, Design Decision 3).
 *
 * Renders every raster brand asset from the two hand-authored SVG masters:
 *
 *   src/app/icon.svg               → src/app/icon.png          (512×512)
 *                                  → src/app/apple-icon.png    (180×180, opaque)
 *                                  → src/app/favicon.ico       (16/32/48 multi-size)
 *                                  → public/icons/icon-192.png (192×192)
 *                                  → public/icons/icon-512.png (512×512)
 *   scripts/brand-assets/og-banner.svg → public/brand/og-fallback.png (1200×630)
 *
 * Usage (one-off, NOT part of `npm run build`/CI):
 *
 *   npm run generate:brand-assets -w apps/store-client
 *
 * Unlike scripts/screenshots.mjs (gitignored dev output), the outputs here are
 * real shipped static assets — commit them alongside the SVG masters. When a
 * designer delivers the final logo, replace the SVG masters at the same paths
 * and re-run this script; no code changes needed (layout.tsx / manifest.ts /
 * site.ts reference fixed paths).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(scriptsDir, "..", "src", "app");
const publicDir = path.join(scriptsDir, "..", "public");

/**
 * Brand primary (light) — mirrors `--color-primary` / shared/config/theme.ts
 * PRIMARY_COLOR. Used to flatten the apple-icon: iOS ignores alpha and fills
 * transparent pixels with black, so the rounded-corner transparency of the
 * master must be flattened onto an opaque brand background.
 */
const BRAND_BG = "#4f46e5";

/** Render an SVG buffer to a square PNG buffer of the given size. */
function renderPng(svg, size, { flatten = false } = {}) {
  // The icon master is 512×512; raise the rasterization density for any target
  // above the intrinsic size so librsvg renders vectors natively instead of
  // sharp upscaling a smaller bitmap (keeps 512 targets crisp).
  const density = Math.max(72, (72 * size) / 512);
  let pipeline = sharp(svg, { density }).resize(size, size);
  if (flatten) {
    pipeline = pipeline.flatten({ background: BRAND_BG });
  }
  return pipeline.png().toBuffer();
}

async function main() {
  const iconSvg = await readFile(path.join(appDir, "icon.svg"));
  const ogSvg = await readFile(
    path.join(scriptsDir, "brand-assets", "og-banner.svg"),
  );

  await mkdir(path.join(publicDir, "icons"), { recursive: true });
  await mkdir(path.join(publicDir, "brand"), { recursive: true });

  const outputs = [];
  const write = async (filePath, buffer) => {
    await writeFile(filePath, buffer);
    outputs.push(
      `${path.relative(path.join(scriptsDir, ".."), filePath)} (${buffer.length} bytes)`,
    );
  };

  // Favicon package (Next.js file-based metadata conventions in src/app/).
  await write(path.join(appDir, "icon.png"), await renderPng(iconSvg, 512));
  await write(
    path.join(appDir, "apple-icon.png"),
    await renderPng(iconSvg, 180, { flatten: true }),
  );
  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map((size) => renderPng(iconSvg, size)),
  );
  await write(path.join(appDir, "favicon.ico"), await pngToIco(icoPngs));

  // Web App Manifest icons (referenced by src/app/manifest.ts).
  await write(
    path.join(publicDir, "icons", "icon-192.png"),
    await renderPng(iconSvg, 192),
  );
  await write(
    path.join(publicDir, "icons", "icon-512.png"),
    await renderPng(iconSvg, 512),
  );

  // OG fallback banner (referenced by app/layout.tsx via BRAND_OG_IMAGE_PATH).
  await write(
    path.join(publicDir, "brand", "og-fallback.png"),
    await sharp(ogSvg).resize(1200, 630).png().toBuffer(),
  );

  console.log("Generated brand assets:");
  for (const line of outputs) console.log(`  ${line}`);
}

main().catch((error) => {
  console.error("Brand asset generation failed:", error);
  process.exitCode = 1;
});
