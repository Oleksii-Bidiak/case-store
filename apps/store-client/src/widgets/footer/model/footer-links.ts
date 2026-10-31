// Pure link shaping for the direction-В footer (TASK-2078) — no React, no I/O.

/**
 * Published LEGAL documents that answer a buyer's question (how is it
 * delivered, how do I return it, what does the warranty cover). They sit in
 * the «Покупцям» column; every other LEGAL document — the offer, the privacy
 * policy, the terms, and anything the owner publishes later — goes to the
 * legal row of the bottom bar. A renamed slug therefore degrades to the
 * bottom bar, never out of the footer.
 */
export const BUYER_LEGAL_SLUGS: readonly string[] = [
  "delivery",
  "returns",
  "warranty",
];

/** Caps, so an admin who publishes many pages cannot stretch the footer. */
export const FOOTER_BUYER_DOCS_LIMIT = 3;
export const FOOTER_BOTTOM_LEGAL_LIMIT = 6;
export const FOOTER_HELP_PAGES_LIMIT = 3;
/** «Каталог» lists this many root categories, then «Усі категорії». */
export const FOOTER_CATEGORIES_LIMIT = 6;

interface SluggedPage {
  slug: string;
}

/** Split published LEGAL pages into the buyer column and the bottom legal row. */
export function splitLegalPages<T extends SluggedPage>(
  pages: readonly T[],
): { buyer: T[]; legal: T[] } {
  const buyer = pages
    .filter((page) => BUYER_LEGAL_SLUGS.includes(page.slug))
    .slice(0, FOOTER_BUYER_DOCS_LIMIT);
  const legal = pages
    .filter((page) => !BUYER_LEGAL_SLUGS.includes(page.slug))
    .slice(0, FOOTER_BOTTOM_LEGAL_LIMIT);
  return { buyer, legal };
}

/**
 * True for a Ukrainian free-phone number (0 800 …, +380 800 …). Only then may
 * the footer say «Дзвінки безкоштовні» — a city or mobile number costs the
 * caller their tariff.
 */
export function isTollFreePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0800") || digits.startsWith("380800");
}

/** `tel:` target — the number without spaces, dashes or brackets. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
