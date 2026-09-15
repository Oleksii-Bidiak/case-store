import { brandControllerFindAll } from "@/shared/api/generated/brands/brands";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { deviceControllerFindModels } from "@/shared/api/generated/devices/devices";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";

/**
 * The catalogue's pre-TASK-420 query params — uuid-valued — and the slug-valued
 * param each one became.
 *
 * `?categoryId=` has no slug twin on `/categories/[slug]`: that route names its
 * category in the path, so a legacy category id there is redundant and is
 * simply dropped (see {@link resolveLegacyCatalogParams}).
 */
const LEGACY_TO_SLUG_PARAM = {
  categoryId: "category",
  brandId: "brand",
  deviceModelId: "device",
} as const;

type LegacyParam = keyof typeof LEGACY_TO_SLUG_PARAM;

const LEGACY_PARAMS = Object.keys(LEGACY_TO_SLUG_PARAM) as LegacyParam[];

type SearchParamRecord = Record<string, string | string[] | undefined>;

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Depth-first walk of the public category tree, flattened to (id → slug). */
function collectCategorySlugs(
  nodes: CategoryTreeNodeEntity[],
  into: Map<string, string>,
): Map<string, string> {
  for (const node of nodes) {
    into.set(node.id, node.slug);
    collectCategorySlugs(node.children ?? [], into);
  }
  return into;
}

/** id → slug for one axis. Returns an empty map on any failure (see below). */
async function loadSlugById(param: LegacyParam): Promise<Map<string, string>> {
  try {
    if (param === "categoryId") {
      const { data } = await categoryControllerGetCategoryTree();
      return collectCategorySlugs(data ?? [], new Map());
    }
    if (param === "brandId") {
      const { data } = await brandControllerFindAll();
      return new Map(data.map((brand) => [brand.id, brand.slug]));
    }
    const { data } = await deviceControllerFindModels();
    return new Map(data.map((model) => [model.id, model.slug]));
  } catch {
    // Degrade to "cannot map this id", which drops the dead param below. The
    // alternative — keeping it — would 308 to a URL that still carries the
    // legacy param and redirect forever.
    return new Map();
  }
}

export interface LegacyCatalogParamsOptions {
  /**
   * Drop `?categoryId=` outright instead of rewriting it to `?category=`.
   *
   * For `/categories/[slug]`, where the route segment already names the
   * category: rewriting would put a second, possibly contradicting category in
   * the query string, and `ProductListView` ignores it there anyway.
   */
  dropCategory?: boolean;
}

/**
 * Detect the pre-TASK-420 uuid catalogue params and compute the slug-shaped
 * query string that replaces them — the body of the 308 the three listing
 * routes serve.
 *
 * Returns `null` when the URL carries none of them, which is the overwhelmingly
 * common case and costs ZERO requests: the lookups below only fire for a legacy
 * URL, and only for the axes that URL actually names.
 *
 * An id that resolves to nothing (deleted brand, typo, hand-edited link) is
 * DROPPED rather than carried over. Two reasons, and the second is the one that
 * matters: a dead id cannot be spelled as a slug at all, and any rewrite that
 * kept the legacy param would redirect to a URL that triggers this same
 * redirect — a loop. The result is therefore guaranteed to contain none of
 * {@link LEGACY_PARAMS}.
 */
export async function resolveLegacyCatalogParams(
  searchParams: SearchParamRecord,
  { dropCategory = false }: LegacyCatalogParamsOptions = {},
): Promise<string | null> {
  const present = LEGACY_PARAMS.filter((param) =>
    Boolean(first(searchParams[param])),
  );
  if (present.length === 0) return null;

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if ((LEGACY_PARAMS as string[]).includes(key)) continue;
    for (const single of Array.isArray(value) ? value : [value]) {
      if (single !== undefined) next.append(key, single);
    }
  }

  const toResolve = present.filter(
    (param) => !(dropCategory && param === "categoryId"),
  );
  const maps = await Promise.all(toResolve.map(loadSlugById));

  toResolve.forEach((param, index) => {
    const id = first(searchParams[param])!;
    const slug = maps[index].get(id);
    // A param the shopper never sees is not worth a second guess: no slug means
    // no filter, and the 308 lands on the same listing minus a dead narrowing.
    if (slug) next.set(LEGACY_TO_SLUG_PARAM[param], slug);
  });

  return next.toString();
}

/** Append a query string to a path, omitting the `?` when there is nothing to ask. */
export function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}
