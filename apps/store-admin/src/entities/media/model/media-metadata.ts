import { MediaUsageEntityKind } from "@/shared/api";
import { dict } from "@/shared/config";

/**
 * Caps mirrored from `media-metadata.dto.ts` on the API.
 *
 * Mirrored, not guessed: the input that stops at 300 characters is the only
 * thing between an operator and a 400 they cannot read. A client cap that is
 * LOOSER than the server's turns a typing limit into a failed save; a tighter
 * one silently forbids input the API would have taken. If the DTO changes, these
 * change with it.
 */
export const MAX_MEDIA_ALT_LENGTH = 300;
export const MAX_MEDIA_TAGS = 20;
export const MAX_MEDIA_TAG_LENGTH = 50;

/**
 * The Ukrainian noun for every usage kind the API can report.
 *
 * The API deliberately ships no UI copy — `MediaUsageEntity.kind` is a column
 * name and `label` is the row's own title — so the wording lives in the
 * dictionary and the screen renders «Фото товару» + «iPhone 16 Pro».
 *
 * The annotation is the point of this line, not the value: `Record<MediaUsageEntityKind, …>`
 * makes a kind added to `MEDIA_USAGE_KINDS` on the API a COMPILE error here the
 * moment the models are regenerated. Without it, a fourteenth column quietly
 * starts showing operators the raw `SEO_STORE_LOGO` in a list whose whole job is
 * to tell them where to go and change something.
 */
const USAGE_KIND_LABELS: Record<MediaUsageEntityKind, string> =
  dict.mediaLibrary.usageKinds;

/**
 * The label for one kind.
 *
 * Takes a plain `string` and falls back to the raw key, because the value on the
 * wire is whatever the API sent — a panel deployed one release behind must still
 * print something an operator can quote down the phone, not an empty cell.
 */
export function mediaUsageKindLabel(kind: string): string {
  return (
    (USAGE_KIND_LABELS as Record<string, string | undefined>)[kind] ?? kind
  );
}

/**
 * Split what the operator typed into the tag array the API expects.
 *
 * Mirrors `normaliseTags` on the server — trim, drop blanks, collapse
 * case-insensitive duplicates while keeping the spelling typed first. Doing it
 * here as well is not redundancy: the field shows back what it will send, so
 * «Банер, банер» does not silently become one tag only after a round-trip.
 */
export function parseMediaTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const entry of value.split(",")) {
    const tag = entry.trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/** The inverse of {@link parseMediaTags} — what the input is seeded with. */
export function formatMediaTags(tags: readonly string[]): string {
  return tags.join(", ");
}

/**
 * Whether a parsed tag list is something the API will accept.
 *
 * Checked before the request rather than after it, because the alternative is
 * what the operator actually sees today on every other over-long field: a 400
 * flattened into «Не вдалося зберегти», with no hint that the fix is "use fewer
 * tags". The alt field cannot reach this state at all — it carries `maxLength` —
 * but a tag list is one string that becomes many values, and no input attribute
 * expresses "at most twenty of them, each at most fifty characters".
 */
export function isValidMediaTagList(tags: readonly string[]): boolean {
  return (
    tags.length <= MAX_MEDIA_TAGS &&
    tags.every((tag) => tag.length <= MAX_MEDIA_TAG_LENGTH)
  );
}
