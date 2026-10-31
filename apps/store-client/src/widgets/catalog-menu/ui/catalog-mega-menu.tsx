"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  CategoryIcon,
  CategoryTileImage,
  ProductThumb,
  Skeleton,
} from "@/shared/ui";
import {
  categoryHref,
  paneTiles,
  tileLinks,
  type CatalogNode,
} from "../model/category-tree";
import { CatalogMenuDevice } from "./catalog-menu-device";
import { FOCUS_RING, ICON_SQUARE } from "./menu-styles";

const t = dict.catalogMenu.mega;

/**
 * How long the pointer must rest on a root before its pane replaces the
 * current one. Short enough to feel instant, long enough that a diagonal
 * sweep from a root to a tile across the rows below it does not flip the
 * pane under the cursor on the way.
 */
export const ROOT_HOVER_INTENT_MS = 80;

/** Marks the pane's first focus target for ArrowRight from a root. */
const TILE_LINK_ATTR = "data-catalog-tile-link";

const PILL =
  "inline-flex h-9 items-center rounded-full border border-border px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

export interface CatalogMegaMenuProps {
  /** Close the panel — every link and «Усі моделі» call it. */
  onClose: () => void;
}

/**
 * CatalogMegaMenu — the content of the «Каталог» panel from `lg` (TASK-2072,
 * CatalogMenu mockup, variant 2c with tiles). Three columns:
 *
 * 1. the roots, each with its sprite icon (TASK-1956); hovering or focusing
 *    one makes it the active root;
 * 2. the active root's pane: its children as tiles with the category image
 *    (a gradient monogram when there is none), up to four level-3 links under
 *    each and «Ще N →»; level 4 is left to the catalog's own navigation;
 * 3. from `xl`, «Ваш пристрій» ({@link CatalogMenuDevice}).
 *
 * The host (the header pill) owns the box, the open state, Escape, outside
 * click, Tab-out and the scroll lock; this component owns the content and its
 * keyboard: the roots are ONE tab stop walked with ↑/↓/Home/End (wrapping),
 * → jumps into the pane, ← from any pane link comes back to the active root.
 *
 * Disclosure navigation, not `role="menu"`: tiles with nested link lists and a
 * column of buttons cannot be valid menu items, so everything here is plain
 * links and buttons in reading order.
 */
export function CatalogMegaMenu({ onClose }: CatalogMegaMenuProps) {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const roots = data?.data ?? [];

  // The first root is active on open, so the pane is never blank.
  const [activeRootId, setActiveRootId] = useState<string | undefined>();
  const activeRoot = roots.find((r) => r.id === activeRootId) ?? roots[0];

  const rootRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const paneRef = useRef<HTMLDivElement | null>(null);

  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  function focusRoot(index: number) {
    const root = roots[index];
    if (!root) return;
    setActiveRootId(root.id);
    rootRefs.current[root.id]?.focus();
  }

  function onRootKeyDown(event: KeyboardEvent, index: number) {
    const last = roots.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      focusRoot(moves[event.key]);
      return;
    }
    if (event.key === "ArrowRight") {
      const first = paneRef.current?.querySelector<HTMLElement>(
        `[${TILE_LINK_ATTR}]`,
      );
      if (!first) return;
      event.preventDefault();
      first.focus();
    }
  }

  function onPaneKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" || !activeRoot) return;
    if (!(event.target instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    rootRefs.current[activeRoot.id]?.focus();
  }

  if (isError) {
    return (
      <p role="alert" className="w-62 px-3 py-2 text-sm text-destructive">
        {dict.catalog.categoriesError}
      </p>
    );
  }

  return (
    <div className="flex text-popover-foreground">
      <nav
        aria-label={t.rootsAria}
        className="flex w-62 shrink-0 flex-col border-r border-border pr-2"
      >
        {isPending ? (
          <div className="flex flex-col gap-1 p-1" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-menu" />
            ))}
          </div>
        ) : roots.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {dict.catalog.noCategories}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {roots.map((root, index) => {
              const active = root.id === activeRoot?.id;
              return (
                <li key={root.id}>
                  <Link
                    ref={(el) => {
                      rootRefs.current[root.id] = el;
                    }}
                    href={categoryHref(root)}
                    // Roving tab stop: the column is ONE Tab away and follows
                    // the active root, so Tab re-enters where the visitor left.
                    tabIndex={active ? 0 : -1}
                    onMouseEnter={() => {
                      window.clearTimeout(hoverTimer.current);
                      hoverTimer.current = window.setTimeout(
                        () => setActiveRootId(root.id),
                        ROOT_HOVER_INTENT_MS,
                      );
                    }}
                    onMouseLeave={() => window.clearTimeout(hoverTimer.current)}
                    onFocus={() => setActiveRootId(root.id)}
                    onKeyDown={(event) => onRootKeyDown(event, index)}
                    onClick={onClose}
                    className={cn(
                      "flex min-h-10.5 items-center gap-3 rounded-menu py-0.75 pr-2.5 pl-1 text-sm font-medium transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/60",
                      FOCUS_RING,
                    )}
                  >
                    <span
                      className={cn(
                        ICON_SQUARE,
                        "size-8.5",
                        active && "bg-card shadow-card",
                      )}
                    >
                      <CategoryIcon icon={root.icon} className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {root.name}
                    </span>
                    {root.children.length > 0 && (
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Pane — 2 tile columns at lg, 3 from xl. A fixed width per breakpoint
          keeps the panel from resizing as the pointer crosses the roots. */}
      <div
        ref={paneRef}
        onKeyDown={onPaneKeyDown}
        className="flex w-108 shrink-0 flex-col pt-0.5 pr-1 pb-0.5 pl-4 xl:w-150"
      >
        {!isPending && activeRoot && (
          <RootPane root={activeRoot} onClose={onClose} />
        )}

        {!isPending && (
          <div className="mt-auto flex gap-1.5 pt-3.5 pb-0.5">
            <Link
              href="/categories"
              onClick={onClose}
              className={cn(PILL, FOCUS_RING)}
            >
              {dict.header.catalogAll}
            </Link>
            <Link
              href="/products"
              onClick={onClose}
              className={cn(PILL, FOCUS_RING)}
            >
              {dict.header.catalogAllProducts}
            </Link>
          </div>
        )}
      </div>

      <CatalogMenuDevice onClose={onClose} />
    </div>
  );
}

/** The active root's heading, «Усі →» and its tiles. */
function RootPane({
  root,
  onClose,
}: {
  root: CatalogNode;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="mx-1 mt-2 mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold text-foreground">
          {root.name}
        </h2>
        {/* No product count on the tree yet (TASK-2138) → «Усі →». */}
        <Link
          href={categoryHref(root)}
          onClick={onClose}
          aria-label={t.allInAria(root.name)}
          className={cn(
            "rounded-sm text-sm font-semibold whitespace-nowrap hover:underline",
            FOCUS_RING,
          )}
        >
          {t.allIn()}
        </Link>
      </div>

      <ul className="grid grid-cols-2 items-start gap-2.5 xl:grid-cols-3">
        {paneTiles(root).map((tile) => (
          <Tile key={tile.id} node={tile} onClose={onClose} />
        ))}
      </ul>
    </div>
  );
}

function Tile({ node, onClose }: { node: CatalogNode; onClose: () => void }) {
  const { links, rest } = tileLinks(node);
  return (
    <li className="flex flex-col gap-1.5 rounded-md bg-background p-2 pb-3">
      <Link
        href={categoryHref(node)}
        onClick={onClose}
        data-catalog-tile-link=""
        className={cn("group flex flex-col gap-1.5 rounded-menu", FOCUS_RING)}
      >
        <span className="block h-21 overflow-hidden rounded-menu">
          <CategoryTileImage
            src={node.image}
            alt=""
            sizes="200px"
            className="size-full object-cover"
            fallback={
              <ProductThumb
                name={node.name}
                className="size-full"
                initialClassName="text-4xl"
              />
            }
          />
        </span>
        <span className="px-1.5 text-sm leading-snug font-semibold text-foreground group-hover:underline">
          {node.name}
        </span>
      </Link>

      {links.length > 0 && (
        <ul className="mt-1 flex flex-col px-1.5">
          {links.map((link) => (
            <li key={link.id}>
              <Link
                href={categoryHref(link)}
                onClick={onClose}
                className={cn(
                  "block rounded-sm py-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground hover:underline",
                  FOCUS_RING,
                )}
              >
                {link.name}
              </Link>
            </li>
          ))}
          {rest > 0 && (
            <li>
              <Link
                href={categoryHref(node)}
                onClick={onClose}
                aria-label={t.moreAria(rest, node.name)}
                className={cn(
                  "block rounded-sm py-1 text-sm leading-snug font-semibold text-foreground hover:underline",
                  FOCUS_RING,
                )}
              >
                {t.more(rest)}
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
