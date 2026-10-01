// Heading scale — design-system.md §3 (owner decision 7.5, TASK-861).
//
// Page titles and section headings use exactly these class lists; no page
// hard-codes a `text-[..px]` heading size. Colour and spacing are NOT part of
// the constants — add them next to it at the call site
// (``className={`${H1_CLASS} text-foreground`}``), because some headings sit on
// a gradient banner and inherit white text.
//
// Card / panel titles that are an `h2` only because they sit directly under the
// page h1 are not section headings: they keep the H3 role sizing from the scale
// (`text-lg` … `text-2xl`, no responsive bump) so they never outrank the
// sections around them.

/** Homepage hero slider only. */
export const HERO_CLASS =
  "font-display text-4xl md:text-6xl font-bold tracking-tight";

/** The page title — exactly one `h1` per page. */
export const H1_CLASS =
  "font-display text-3xl md:text-4xl font-bold tracking-tight";

/** Section heading ("Популярне", "Схожі товари", banners, rails). */
export const H2_CLASS = "font-display text-2xl md:text-3xl font-semibold";
