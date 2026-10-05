"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import {
  SearchAutocomplete,
  SearchSuggestionsPopup,
  useSearchAutocomplete,
} from "@/features/search";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * HeaderSearch — the desktop search pill from the design import: one bordered
 * container holding the "Каталог" mega-menu trigger (left segment), the search
 * input (middle), and a primary submit button (right). The catalog panel is
 * filled with the real root categories; the input shows typo-tolerant
 * suggestions. Both dropdowns anchor to the full pill and are mutually exclusive.
 * The suggestions dropdown mixes products with up to 5 matching blog articles
 * (TASK-218) — two labelled listboxes navigated as one combined list.
 *
 * The suggestions are NOT implemented here (TASK-805): the pill runs the one
 * storefront autocomplete, `useSearchAutocomplete` + `SearchSuggestionsPopup`
 * from `features/search`, and only supplies its own input chrome and the
 * full-pill anchor. Hidden below `md` — mobile navigates via the header Sheet.
 *
 * The catalog panel is fully keyboard-operable (TASK-413): ↑/↓/Home/End walk
 * one pane, →/← cross between them, each pane keeps a single roving tab stop,
 * Escape closes and hands focus back to the trigger, and the page behind the
 * open panel is scroll-locked.
 *
 * Between `md` and `lg` the row has no room for the 410px pill (it squeezed the
 * wordmark to ~16px at 768px), so the input and submit segments collapse into a
 * single magnifier that drops a panel with the shared {@link SearchAutocomplete}
 * (TASK-411). The "Каталог" segment stays at every width this widget exists at —
 * from `xl` it is the only catalog entry point, since the slide-out menu that
 * carries the category accordion is `xl:hidden` (TASK-413, TASK-511/512).
 */
export function HeaderSearch() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // SSR-stable id (never random) for the compact panel's aria-controls.
  const uid = useId();
  const compactPanelId = `${uid}-compact-panel`;

  // The pill's own autocomplete instance — the same hook the compact panel and
  // the mobile menu run through `SearchAutocomplete` (TASK-805).
  const search = useSearchAutocomplete();
  const searchOpen = search.isOpen;
  const [catalogOpen, setCatalogOpen] = useState(false);
  /** Below `lg`: the magnifier's drop-down panel (TASK-411). */
  const [compactOpen, setCompactOpen] = useState(false);

  // Category tree (TASK-082) — roots + one nested level for the flyout. The
  // endpoint hardcodes isActive + sortOrder ascending server-side, matching the
  // params the old flat root-categories call passed explicitly.
  const {
    data: catData,
    isPending: catPending,
    isError: catError,
  } = useCategoryControllerGetCategoryTree();
  const categories = catData?.data ?? [];

  // Which root's children the flyout's right pane shows. Defaults to the first
  // root (same "first group" convention as CategoriesView) so the pane is never
  // blank on open.
  const [activeRootId, setActiveRootId] = useState<string | undefined>();
  const activeRoot =
    categories.find((c) => c.id === activeRootId) ?? categories[0];

  /**
   * Which child holds the right pane's single tab stop. Deliberately NOT reset
   * by an effect when the active root changes: the id simply stops matching any
   * child, `findIndex` returns -1, and the fallback below hands the tab stop
   * back to the first row. One less effect, and no frame where the pane has no
   * tabbable row at all.
   */
  const [activeChildId, setActiveChildId] = useState<string | undefined>();
  const activeChildren = activeRoot?.children ?? [];
  const foundChildIndex = activeChildren.findIndex(
    (c) => c.id === activeChildId,
  );
  const childTabIndex = foundChildIndex >= 0 ? foundChildIndex : 0;

  // Focus plumbing for the two-pane keyboard traversal (ArrowRight/ArrowLeft)
  // and for returning focus to the trigger when Escape closes the panel.
  const catalogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const compactTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rootLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const childLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  /**
   * Vertical traversal inside one pane (TASK-413). Wraps, as the APG menu
   * pattern prescribes for a vertical menu, so End→ArrowDown is never a dead
   * key. Moving focus onto a root also previews its children, which is exactly
   * what hovering it does — arrows and the pointer drive the same pane.
   */
  function focusRoot(index: number) {
    const category = categories[index];
    if (!category) return;
    setActiveRootId(category.id);
    rootLinkRefs.current[category.id]?.focus();
  }

  function focusChild(index: number) {
    const child = activeChildren[index];
    if (!child) return;
    setActiveChildId(child.id);
    childLinkRefs.current[child.id]?.focus();
  }

  /**
   * Shared ↑/↓/Home/End handling for both panes: `move` receives the index to
   * land on, already wrapped by the caller's list length. Returns true when the
   * key was consumed, so each pane can add its own horizontal key on top.
   */
  function handleVerticalKeys(
    event: React.KeyboardEvent,
    index: number,
    length: number,
    move: (next: number) => void,
  ) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move((index + 1) % length);
        return true;
      case "ArrowUp":
        event.preventDefault();
        move((index - 1 + length) % length);
        return true;
      case "Home":
        event.preventDefault();
        move(0);
        return true;
      case "End":
        event.preventDefault();
        move(length - 1);
        return true;
      default:
        return false;
    }
  }

  /**
   * Scroll-lock while the catalogue panel is open (TASK-413). The cleanup — not
   * a per-close-path call — is what makes the unlock reliable: Escape, an
   * outside click, picking a link and unmounting the header all funnel through
   * `catalogOpen` going false, and React runs this teardown for every one of
   * them.
   *
   * `data-scroll-locked` is Radix's own attribute name, and it is deliberate:
   * globals.css drops `scrollbar-gutter: stable` exactly while that attribute
   * is on <body>, so the gutter and the compensation below can never be counted
   * twice. That also means the margin is NOT optional — without it the page
   * would slide sideways by the gutter width the moment the panel opens.
   */
  useEffect(() => {
    if (!catalogOpen) return;
    const { body } = document;
    // A Radix overlay already owns the page — don't take a lock we would then
    // release out from under it. (They cannot both be open in practice: opening
    // the slide-out menu is an outside click that closes this panel first.)
    if (body.hasAttribute("data-scroll-locked")) return;

    // How much narrower the root box is than the viewport — the gutter that is
    // about to be given back. NOT `innerWidth - documentElement.clientWidth`,
    // the usual idiom: under `scrollbar-gutter: stable` Chrome keeps reporting
    // the full viewport in clientWidth (measured: 1280 vs a 1270px root box),
    // so that subtraction reads 0 and the compensation silently does nothing.
    // A layout-less environment (jsdom) reports 0 and is simply not compensated.
    const rootWidth = document.documentElement.offsetWidth;
    const gutter = rootWidth > 0 ? window.innerWidth - rootWidth : 0;
    const previousOverflow = body.style.overflow;
    const previousMarginRight = body.style.marginRight;

    body.style.overflow = "hidden";
    if (gutter > 0) body.style.marginRight = `${gutter}px`;
    body.setAttribute("data-scroll-locked", "");

    return () => {
      body.style.overflow = previousOverflow;
      body.style.marginRight = previousMarginRight;
      body.removeAttribute("data-scroll-locked");
    };
  }, [catalogOpen]);

  // Close every dropdown on outside-click and Escape.
  const closeSearch = search.close;
  useEffect(() => {
    if (!searchOpen && !catalogOpen && !compactOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeSearch();
        setCatalogOpen(false);
        setCompactOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearch();
        setCatalogOpen(false);
        setCompactOpen(false);
        // Keyboard users keep their place: Escape on the catalog panel returns
        // focus to the "Каталог" trigger (TASK-082), and on the compact search
        // panel to the magnifier that opened it (TASK-411).
        if (catalogOpen) catalogTriggerRef.current?.focus();
        else if (compactOpen) compactTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [searchOpen, catalogOpen, compactOpen, closeSearch]);

  return (
    <div
      ref={containerRef}
      // Tabbing out of an open catalogue panel closes it (TASK-413). Without
      // this the panel stays open behind a focus ring the visitor has already
      // left, and — now that the page under it is scroll-locked — focus can
      // walk down to something it cannot scroll into view. `relatedTarget` is
      // where focus is heading; inside our own box it is pane-to-pane movement,
      // which must not close anything. A NULL relatedTarget is deliberately
      // ignored: that is focus dropping to <body> — a click on the panel's own
      // padding looks exactly like that, and real outside clicks are already
      // the pointerdown handler's job.
      onBlur={(event) => {
        if (!catalogOpen || !event.relatedTarget) return;
        if (containerRef.current?.contains(event.relatedTarget)) return;
        setCatalogOpen(false);
      }}
      // Only from `lg` does the pill claim the row's free space; in the md–lg
      // band the widget is as wide as its content (Каталог + magnifier).
      //
      // `lg:min-w-0` is load-bearing (TASK-413). A flex item defaults to
      // `min-width: auto`, i.e. it refuses to go below its min-content — 410px
      // here. Once the row also carries the section links and the theme switch,
      // the free space at 1024 is 253, so the pill clamped itself at 410 and
      // the overflow was billed to the only shrinkable item left: the brand,
      // which collapsed to 1px. The search field is the elastic part of this
      // row; the store's name is not. Since TASK-511/512 the section links and
      // the theme switch wait for `xl` and the actions are icon-only below it,
      // so at 1024 the input gets ≈317px instead of ~79 (e2e/header-widths).
      className="relative z-40 hidden md:block lg:max-w-2xl lg:min-w-0 lg:flex-1"
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          search.submit();
        }}
      >
        <div className="flex h-12 items-center overflow-hidden rounded-xl border-[1.5px] border-border bg-background">
          {/* Каталог — mega-menu trigger (left segment). */}
          <button
            ref={catalogTriggerRef}
            type="button"
            onClick={() => {
              setCatalogOpen((v) => !v);
              search.close();
              // The magnifier's panel is a peer dropdown, not a sibling of
              // this one: both are absolutely positioned at the same corner,
              // so leaving it open would stack two panels over each other and
              // report aria-expanded from two triggers at once. Opening
              // either closes the other (TASK-411).
              setCompactOpen(false);
              // Fresh open always previews the first root's children.
              setActiveRootId(undefined);
            }}
            aria-expanded={catalogOpen}
            aria-haspopup="menu"
            aria-label={dict.header.catalogAria}
            className="flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Menu className="size-[18px]" aria-hidden="true" />
            {dict.header.catalogButton}
          </button>

          {/* Search input (middle). */}
          <input
            type="text"
            {...search.inputProps}
            aria-label={dict.search.inputAria}
            placeholder={dict.search.placeholder}
            onChange={(event) => {
              search.inputProps.onChange(event);
              setCatalogOpen(false);
            }}
            className="hidden h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground lg:block"
          />

          {/* Compact trigger (md–lg) — opens the search panel below. `w-12` on
              a 48px-tall pill is a 48×48 touch target. */}
          <button
            ref={compactTriggerRef}
            type="button"
            onClick={() => {
              setCompactOpen((v) => !v);
              setCatalogOpen(false);
              search.close();
            }}
            aria-expanded={compactOpen}
            aria-controls={compactPanelId}
            aria-label={dict.search.openPanel}
            className="flex h-full w-12 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:hidden"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>

          {/* Primary submit (right) — pairs with the input, so it shares its
              breakpoint. */}
          <button
            type="submit"
            aria-label={dict.search.submitAria}
            className="hidden h-full w-[54px] shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:flex"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Compact search panel (md–lg) — the shared autocomplete, focused on
          open so the magnifier behaves like the input it replaces. */}
      {compactOpen && (
        <div
          id={compactPanelId}
          // `w-96` is measured against the narrowest width this panel exists
          // at: 384px fits beside the logo from 768px up. `max-w-full` would
          // clamp it to the pill (the relative box), not the viewport.
          className="absolute top-full left-0 z-50 mt-2 w-96 rounded-2xl border border-border bg-popover p-3 shadow-lift lg:hidden"
        >
          <SearchAutocomplete
            id="compact-search"
            autoFocus
            onNavigate={() => setCompactOpen(false)}
          />
        </div>
      )}

      {/* Catalog panel — root categories + the active root's children in a
          two-pane flyout (TASK-082). Root links keep navigating on click; the
          right pane is a purely additive hover/focus preview. */}
      {catalogOpen && (
        <div
          role="menu"
          aria-label={dict.header.catalogAria}
          className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-2xl border border-border bg-popover p-2 shadow-lift"
        >
          {catPending && (
            <div className="flex w-64 flex-col gap-1 p-1" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}
          {catError && (
            <p role="alert" className="w-64 px-3 py-2 text-sm text-destructive">
              {dict.catalog.categoriesError}
            </p>
          )}
          {!catPending && !catError && (
            <>
              <div className="flex">
                <ul className="w-64 pr-2">
                  {categories.map((category, index) => (
                    <li key={category.id}>
                      <Link
                        ref={(el) => {
                          rootLinkRefs.current[category.id] = el;
                        }}
                        href={`/categories/${category.slug}`}
                        role="menuitem"
                        // Roving tab stop: the root list is ONE Tab away, and
                        // ↑/↓ walk it from there. The stop follows the active
                        // root, so Tab always re-enters where the visitor left.
                        tabIndex={category.id === activeRoot?.id ? 0 : -1}
                        aria-haspopup={
                          category.children.length > 0 ? "true" : undefined
                        }
                        aria-expanded={
                          category.children.length > 0
                            ? category.id === activeRoot?.id
                            : undefined
                        }
                        onMouseEnter={() => setActiveRootId(category.id)}
                        onFocus={() => setActiveRootId(category.id)}
                        onKeyDown={(event) => {
                          if (
                            handleVerticalKeys(
                              event,
                              index,
                              categories.length,
                              focusRoot,
                            )
                          ) {
                            return;
                          }
                          if (
                            event.key === "ArrowRight" &&
                            category.children[0]
                          ) {
                            event.preventDefault();
                            childLinkRefs.current[
                              category.children[0].id
                            ]?.focus();
                          }
                        }}
                        onClick={() => setCatalogOpen(false)}
                        className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                  {categories.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                      {dict.catalog.noCategories}
                    </li>
                  )}
                </ul>

                {activeRoot && activeRoot.children.length > 0 && (
                  <div
                    role="group"
                    aria-label={dict.header.catalogSubcategoriesAria}
                    className="w-64 border-l border-border pl-2"
                  >
                    <ul>
                      {activeRoot.children.map((child, index) => (
                        <li key={child.id}>
                          <Link
                            ref={(el) => {
                              childLinkRefs.current[child.id] = el;
                            }}
                            href={`/categories/${child.slug}`}
                            role="menuitem"
                            // Second roving tab stop — the right pane is its
                            // own list, so Tab steps root pane → child pane →
                            // footer instead of through every subcategory.
                            tabIndex={index === childTabIndex ? 0 : -1}
                            onFocus={() => setActiveChildId(child.id)}
                            onKeyDown={(event) => {
                              if (
                                handleVerticalKeys(
                                  event,
                                  index,
                                  activeRoot.children.length,
                                  focusChild,
                                )
                              ) {
                                return;
                              }
                              if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                rootLinkRefs.current[activeRoot.id]?.focus();
                              }
                            }}
                            onClick={() => setCatalogOpen(false)}
                            className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Two exits, not one (TASK-413): the category index for someone
                  still browsing the taxonomy, and the flat catalogue for
                  someone who is done with it and wants the goods. Both keep the
                  default tab stop — they are the panel's last two Tab targets,
                  after the two roving lists. */}
              <div className="mt-0.5 flex border-t border-border pt-2">
                <Link
                  href="/categories"
                  role="menuitem"
                  onClick={() => setCatalogOpen(false)}
                  className="flex flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {dict.header.catalogAll}
                </Link>
                <Link
                  href="/products"
                  role="menuitem"
                  onClick={() => setCatalogOpen(false)}
                  className="flex flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {dict.header.catalogAllProducts}
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Suggestions dropdown (anchored to the full pill) — the shared popup,
          so the pill and the stand-alone fields cannot drift apart (TASK-805). */}
      {search.showSuggestions && (
        <SearchSuggestionsPopup
          model={search.popup}
          className="absolute top-[calc(100%+8px)] right-0 left-0 z-50"
        />
      )}
    </div>
  );
}
