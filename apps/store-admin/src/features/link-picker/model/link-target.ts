import type { CategoryTreeNodeEntity } from "@/shared/api";
import { dict } from "@/shared/config";

const l = dict.linkPicker;

export type LinkKind = "section" | "category" | "product" | "custom";

export interface SiteSection {
  href: string;
  label: string;
  /** What the section is, for «Веде на /products — весь каталог.» */
  note: string;
}

/**
 * The storefront's own top-level sections — routes of `apps/store-client/src/app`
 * that take no parameter. Kept short on purpose: these are the places a banner
 * button sensibly sends a shopper.
 */
export const SITE_SECTIONS: readonly SiteSection[] = [
  { href: "/products", label: l.sectionCatalog, note: l.noteCatalog },
  { href: "/promo", label: l.sectionPromo, note: l.notePromo },
  { href: "/categories", label: l.sectionCategories, note: l.noteCategories },
  { href: "/blog", label: l.sectionBlog, note: l.noteBlog },
  { href: "/info", label: l.sectionInfo, note: l.noteInfo },
  { href: "/contact", label: l.sectionContact, note: l.noteContact },
];

export const categoryHref = (slug: string) => `/categories/${slug}`;
export const productHref = (slug: string) => `/products/${slug}`;

export interface CategoryOption {
  id: string;
  slug: string;
  /** «Захисне скло → для iPhone» — the path from the root. */
  label: string;
}

/** Depth-first, parents before children, each labelled with its full path. */
export function flattenCategoryPaths(
  nodes: readonly CategoryTreeNodeEntity[] | undefined,
): CategoryOption[] {
  const out: CategoryOption[] = [];
  const visit = (node: CategoryTreeNodeEntity, path: readonly string[]) => {
    const names = [...path, node.name];
    out.push({ id: node.id, slug: node.slug, label: names.join(" → ") });
    for (const child of node.children ?? []) visit(child, names);
  };
  for (const node of nodes ?? []) visit(node, []);
  return out;
}

export interface ResolvedLink {
  kind: LinkKind;
  /** What the trigger shows — a section name, a category path, a slug. */
  label: string;
  /** The section's note, when the link is a known section. */
  note?: string;
}

/**
 * Read a stored address back into what the picker would have produced. An
 * address the picker does not recognise is «Своє» — exactly what it was before
 * the picker existed, so nothing an operator typed is ever reinterpreted.
 */
export function resolveLink(
  href: string,
  categories: readonly CategoryOption[],
  productNames: ReadonlyMap<string, string> = new Map(),
): ResolvedLink | null {
  const value = href.trim();
  if (value === "") return null;

  const section = SITE_SECTIONS.find((item) => item.href === value);
  if (section) {
    return { kind: "section", label: section.label, note: section.note };
  }

  const category = /^\/categories\/([^/?#]+)$/.exec(value);
  if (category) {
    const slug = decodeURIComponent(category[1]);
    const found = categories.find((item) => item.slug === slug);
    return { kind: "category", label: found?.label ?? slug };
  }

  const product = /^\/products\/([^/?#]+)$/.exec(value);
  if (product) {
    const slug = decodeURIComponent(product[1]);
    return { kind: "product", label: productNames.get(value) ?? slug };
  }

  return { kind: "custom", label: value };
}
