// Turns sanitized admin-authored HTML (Tiptap output) into a document with
// stable heading ids + a flat section list, so the sticky TOC / scroll-spy can
// target each `<h2>`. Pure functions — unit-testable, no DOM required.

export interface DocSection {
  /** Injected element id (`sec-0`, `sec-1`, …). */
  id: string;
  /** Plain-text heading label (inner tags stripped). */
  label: string;
}

export interface ExtractedDoc {
  /** The HTML with sequential `id="sec-N"` injected on every `<h2>`. */
  html: string;
  /** One entry per `<h2>`, in document order. */
  sections: DocSection[];
}

/**
 * Inject sequential ids into every `<h2>` and collect them for the TOC. Any
 * pre-existing `id` on an `<h2>` is replaced so ids stay predictable. Run this
 * on already-sanitized HTML.
 */
export function extractDocSections(html: string): ExtractedDoc {
  const sections: DocSection[] = [];
  let index = 0;

  const withIds = html.replace(
    /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi,
    (_match, attrs: string, inner: string) => {
      const id = `sec-${index}`;
      const label = inner
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      sections.push({ id, label });
      index += 1;

      const attrsWithoutId = attrs.replace(
        /\s+id\s*=\s*("[^"]*"|'[^']*')/gi,
        "",
      );
      return `<h2${attrsWithoutId} id="${id}">${inner}</h2>`;
    },
  );

  return { html: withIds, sections };
}

const UK_MONTHS_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

/** Format an ISO date as "12 червня 2026" (falls back to the input on error). */
export function formatLegalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${UK_MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
}

const UK_MONTHS_SHORT = [
  "січ.",
  "лют.",
  "бер.",
  "квіт.",
  "трав.",
  "черв.",
  "лип.",
  "серп.",
  "вер.",
  "жовт.",
  "лист.",
  "груд.",
];

/** Format an ISO date as "12 черв. 2026" (falls back to the input on error). */
export function formatLegalDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${UK_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
