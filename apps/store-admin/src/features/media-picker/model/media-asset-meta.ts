import type { MediaAssetEntity } from "@/entities/media";
import { formatDate, formatFileSize } from "@/shared/lib/format";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

/**
 * Whether an asset was made by the TASK-441 backfill out of an existing product
 * photo — the catalogue import's pictures, in practice.
 *
 * The API has no "source" field, but the backfill leaves an exact signature: no
 * uploader (`uploadedById` is set on every real upload) and none of the three
 * numbers that live inside the file (a migration never opened it). Both halves
 * are required — a real upload with a deleted uploader still has its sizes, and
 * a real upload whose size probe failed still has its uploader.
 */
export function isImportedAsset(
  asset: Pick<MediaAssetEntity, "uploadedById" | "width" | "bytes">,
): boolean {
  return asset.uploadedById === null && asset.width === 0 && asset.bytes === 0;
}

/**
 * The card's third line: «2000 × 1333 · 180 КБ · 25.09.2026».
 *
 * Unknown parts are LEFT OUT rather than printed as «невідомо» (МТ1): a line of
 * «невідомо · невідомо» says nothing an operator can act on, and for imported
 * assets the second line already says why the numbers are missing.
 */
export function mediaCardMeta(asset: MediaAssetEntity): string {
  const parts: string[] = [];
  if (asset.width > 0 && asset.height > 0) {
    parts.push(t.cardDimensions(asset.width, asset.height));
  }
  const size = formatFileSize(asset.bytes);
  if (size) parts.push(size);
  parts.push(formatDate(asset.createdAt));
  return parts.join(" · ");
}

/** Display names for the media types the upload endpoint accepts. */
const FORMAT_NAMES: Record<string, string> = {
  "image/webp": "WebP",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/avif": "AVIF",
};

/**
 * «WebP» for `image/webp`. A name, not copy — the same in every language — so
 * it lives here rather than in the dictionary; an unknown type falls back to
 * the raw media type, which is still something an operator can quote.
 */
export function mediaFormatName(mime: string): string {
  return FORMAT_NAMES[mime] ?? mime;
}
