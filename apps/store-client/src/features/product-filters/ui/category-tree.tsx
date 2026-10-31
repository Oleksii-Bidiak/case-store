"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { categoryTreeView } from "../model/category-tree";

export interface CategoryTreeProps {
  /** The public `GET /categories/tree` payload (roots + up to 3 nested levels). */
  categories: CategoryTreeNodeEntity[];
  /** Slug of the category the page shows; undefined on «Усі товари». */
  currentSlug?: string;
  /** The address of a node (`undefined` = «Усі категорії»). */
  hrefFor: (slug: string | undefined) => string;
  /** Called when a node is followed — the sheet closes itself on it. */
  onNavigate?: () => void;
}

/**
 * Left padding per depth — 10px + 14px a level, the mockup's indent (CatalogNav
 * §10.2). Written out in full so Tailwind finds every class in the source; the
 * last step also covers anything deeper than the public tree goes.
 */
const DEPTH_PADDING = [
  "pl-2.5",
  "pl-6",
  "pl-9.5",
  "pl-13",
  "pl-16.5",
  "pl-20",
] as const;

const depthPadding = (depth: number) =>
  DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)];

type RowKind = "anc" | "cur" | "node";

// One row: the link fills it, a disclosure sits at its right end when the
// node has children. 44px rows below `lg` (the sheet, touch), the mockup's
// 36px in the rail.
const rowClass = (kind: RowKind) =>
  cn(
    "flex items-stretch rounded-menu transition-colors duration-150 ease-out motion-reduce:transition-none",
    kind === "cur"
      ? "bg-primary text-primary-foreground"
      : "text-foreground hover:bg-muted",
  );

const linkClass = (kind: RowKind, depth: number) =>
  cn(
    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-menu py-1.5 pr-2.5 text-left text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-9",
    depthPadding(depth),
    kind === "anc" && "font-medium text-muted-foreground",
    kind === "cur" && "font-bold",
    kind === "node" && "font-medium",
  );

/**
 * CategoryTree (TASK-2011, option a «дерево в рейці») — where the shopper is
 * in the catalogue and every way out of it, as links.
 *
 * Rows, top to bottom: «Усі категорії» → each ancestor (‹, muted) → the level
 * the current category sits on, the current node filled with the primary and
 * opened onto its children. On «Усі товари» «Усі категорії» is the current row
 * and every root hangs under it.
 *
 * Every node is a real `<Link>` to its own address (`hrefFor`), so the rail is
 * in the server HTML as crawlable links and works without JS. A node with
 * children — other than the current one, which is always open — carries a
 * disclosure that opens its children in place (`aria-expanded`), so a shopper
 * can look one level down a sibling without leaving the page. Collapsed
 * children stay in the DOM under `hidden`: the disclosure always controls an
 * element that exists, and crawlers see the whole subtree.
 */
export function CategoryTree({
  categories,
  currentSlug,
  hrefFor,
  onNavigate,
}: CategoryTreeProps) {
  const baseId = useId();
  const { ancestors, level, current } = categoryTreeView(
    categories,
    currentSlug,
  );

  // Nodes opened by hand. A different category is a different tree, so the
  // set starts over when the current slug changes — a render-time guard
  // (docs/conventions/forms.md Rule 1a), not an effect.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [expandedFor, setExpandedFor] = useState(currentSlug);
  if (expandedFor !== currentSlug) {
    setExpandedFor(currentSlug);
    setExpanded(new Set());
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (
    node: CategoryTreeNodeEntity,
    depth: number,
  ): ReactNode => {
    const isCurrent = node.id === current?.id;
    const kind: RowKind = isCurrent ? "cur" : "node";
    const children = node.children ?? [];
    const open = isCurrent || expanded.has(node.id);
    const listId = `${baseId}-${node.id}`;

    return (
      <li key={node.id} className="flex flex-col gap-0.5">
        <div className={rowClass(kind)}>
          <Link
            href={hrefFor(node.slug)}
            onClick={onNavigate}
            aria-current={isCurrent ? "page" : undefined}
            className={linkClass(kind, depth)}
          >
            <span className="min-w-0 flex-1 break-words">{node.name}</span>
          </Link>
          {children.length > 0 && !isCurrent && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={
                open
                  ? dict.filters.categoryTreeCollapse(node.name)
                  : dict.filters.categoryTreeExpand(node.name)
              }
              onClick={() => toggle(node.id)}
              className="grid size-11 shrink-0 place-items-center rounded-menu text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none lg:size-9"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-3.5 motion-safe:transition-transform motion-safe:duration-150",
                  open && "rotate-90",
                )}
              />
            </button>
          )}
        </div>
        {children.length > 0 && (
          <ul id={listId} hidden={!open} className="flex flex-col gap-0.5">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const onAllProducts = current === null;

  return (
    <ul className="flex flex-col gap-0.5">
      <li>
        <div className={rowClass(onAllProducts ? "cur" : "anc")}>
          <Link
            href={hrefFor(undefined)}
            onClick={onNavigate}
            aria-current={onAllProducts ? "page" : undefined}
            className={linkClass(onAllProducts ? "cur" : "anc", 0)}
          >
            {!onAllProducts && (
              <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 break-words">
              {dict.filters.allCategories}
            </span>
          </Link>
        </div>
      </li>
      {ancestors.map((ancestor, i) => (
        <li key={ancestor.id}>
          <div className={rowClass("anc")}>
            <Link
              href={hrefFor(ancestor.slug)}
              onClick={onNavigate}
              className={linkClass("anc", i + 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">
                {ancestor.name}
              </span>
            </Link>
          </div>
        </li>
      ))}
      {level.map((node) => renderNode(node, ancestors.length + 1))}
    </ul>
  );
}
