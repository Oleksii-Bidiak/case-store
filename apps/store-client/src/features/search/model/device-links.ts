// Links and glyphs of the search model block (TASK-2069).

import type { DeviceFamily } from "@/entities/device";

/** «Все для моделі» — the model hub (TASK-1954). */
export function deviceHubHref(slug: string): string {
  return `/devices/${encodeURIComponent(slug)}`;
}

/** The compat landing «Чохли для iPhone 15 Pro» (TASK-490). */
export function deviceLandingHref(categorySlug: string, slug: string): string {
  return `/catalog/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`;
}

/** The search results for another model («Або можливо: iPhone 15 Pro Max»). */
export function searchHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

/** What is drawn on the family disc. */
export type DeviceKind = "phone" | "watch" | "tablet";

/**
 * Phone, watch or tablet, from the family first and the name second — a
 * Galaxy Watch is family «galaxy» (the brand wins) but still a watch.
 */
export function deviceKindOf(model: {
  name: string;
  series?: string | null;
  family?: DeviceFamily | null;
}): DeviceKind {
  if (model.family === "watch") return "watch";
  if (model.family === "ipad") return "tablet";
  const text = `${model.series ?? ""} ${model.name}`.toLowerCase();
  if (/\bwatch\b/.test(text)) return "watch";
  if (/\bi?pad\b|\btab\b/.test(text)) return "tablet";
  return "phone";
}
