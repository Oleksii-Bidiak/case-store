// Recently-viewed history, persisted in localStorage (guest-friendly, no
// backend). The homepage READS this via useSyncExternalStore; the product-detail
// widget WRITES via pushRecentlyViewed when a product page is viewed.
//
// TASK-211: the store keeps only a MINIMAL snapshot (id + slug/name for
// debuggability). Rendering always re-fetches fresh `PublicProductEntity`
// cards by id through the Orval hook (`GET /products/cards`), so prices,
// stock, and images can never go stale in the UI. Legacy entries that carried
// a full price snapshot still parse — only `id` is required — and their ids
// hydrate the same way.

const STORAGE_KEY = "case-store:recently-viewed";
const MAX_ITEMS = 12;

export interface RecentlyViewedItem {
  id: string;
  /** Snapshot only — rendering refetches by id; may be absent on old entries. */
  slug?: string;
  /** Snapshot only — rendering refetches by id; may be absent on old entries. */
  name?: string;
}

// Stable empty reference for the server snapshot and error fallbacks — returning
// a fresh [] each call would make useSyncExternalStore loop forever.
const EMPTY: readonly RecentlyViewedItem[] = Object.freeze([]);

function isItem(value: unknown): value is RecentlyViewedItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && v.id !== "";
}

function parse(raw: string | null): readonly RecentlyViewedItem[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const items = parsed.filter(isItem);
    return items.length > 0 ? items : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Read the recently-viewed list (plain read; server-safe). */
export function readRecentlyViewed(): readonly RecentlyViewedItem[] {
  if (typeof window === "undefined") return EMPTY;
  return parse(window.localStorage.getItem(STORAGE_KEY));
}

// ── External store (useSyncExternalStore) ──────────────────────────────────
// getSnapshot must return a stable reference while the underlying data is
// unchanged, so we cache the last parsed result keyed by the raw string.

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedItems: readonly RecentlyViewedItem[] = EMPTY;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeRecentlyViewed(onChange: () => void): () => void {
  listeners.add(onChange);
  // Cross-tab updates arrive via the native storage event.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getRecentlyViewedSnapshot(): readonly RecentlyViewedItem[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  cachedItems = parse(raw);
  return cachedItems;
}

export function getRecentlyViewedServerSnapshot(): readonly RecentlyViewedItem[] {
  return EMPTY;
}

/**
 * Prepend an item (most-recent-first, deduped by id, capped at MAX_ITEMS).
 * Called from the product-detail widget whenever a product page is viewed.
 * Only the minimal snapshot is persisted — never prices or image URLs.
 */
export function pushRecentlyViewed(item: RecentlyViewedItem): void {
  if (typeof window === "undefined") return;
  try {
    const entry: RecentlyViewedItem = {
      id: item.id,
      slug: item.slug,
      name: item.name,
    };
    const next = [
      entry,
      ...readRecentlyViewed().filter((i) => i.id !== item.id),
    ];
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(next.slice(0, MAX_ITEMS)),
    );
    emit();
  } catch {
    // Ignore quota / serialization errors — history is best-effort.
  }
}

/** Clear the recently-viewed history. */
export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    emit();
  } catch {
    // Ignore.
  }
}
