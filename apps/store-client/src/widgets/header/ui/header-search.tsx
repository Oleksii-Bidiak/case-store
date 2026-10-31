"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import {
  SearchAutocomplete,
  SearchSuggestionsPopup,
  useSearchAutocomplete,
} from "@/features/search";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { dict } from "@/shared/config";

/** `lg` — the mega menu exists from here; below it «Каталог» opens the sheet. */
export const MEGA_MENU_QUERY = "(min-width: 64rem)";

/** What the header hands the catalog panel's content (TASK-2072). */
export interface CatalogMenuSlotProps {
  /** Close the panel (a link was picked, or the device picker is opening). */
  onClose: () => void;
}

export interface HeaderSearchProps {
  /**
   * The «Каталог» panel's content. A slot rather than an import: the mega menu
   * is a widget of its own (`widgets/catalog-menu`) and widgets do not import
   * each other — the app layer composes the two (`app/site-header.tsx`).
   */
  renderCatalogMenu?: (props: CatalogMenuSlotProps) => ReactNode;
  /** Below `lg` the «Каталог» button opens the menu sheet instead (TASK-2072). */
  onOpenMenu?: () => void;
}

function isMegaMenuViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MEGA_MENU_QUERY).matches
  );
}

/**
 * HeaderSearch — the desktop search pill from the design import: one bordered
 * container holding the "Каталог" mega-menu trigger (left segment), the search
 * input (middle), and a primary submit button (right). The input shows
 * typo-tolerant suggestions; the catalog panel's content comes from the
 * `renderCatalogMenu` slot. Both dropdowns are mutually exclusive.
 * The suggestions dropdown mixes products with up to 5 matching blog articles
 * (TASK-218) — two labelled listboxes navigated as one combined list.
 *
 * The suggestions are NOT implemented here (TASK-805): the pill runs the one
 * storefront autocomplete, `useSearchAutocomplete` + `SearchSuggestionsPopup`
 * from `features/search`, and only supplies its own input chrome and the
 * full-pill anchor. Hidden below `md` — mobile navigates via the header Sheet.
 *
 * The catalog panel (TASK-413, TASK-2072): this component owns its box, the
 * open state, Escape (closes and hands focus back to the trigger), outside
 * click, Tab-out and the page scroll lock; the slot owns the content and its
 * keyboard. The box anchors to the header ROW, not to the pill: the mega menu
 * is ≈1142px wide at `xl`, and hung off the pill's left edge (≈218px in at
 * 1280) it ran ~110px past the viewport. Aligned with the logo instead it ends
 * at 1174.
 *
 * Between `md` and `lg` the row has no room for the 410px pill (it squeezed the
 * wordmark to ~16px at 768px), so the input and submit segments collapse into a
 * single magnifier that drops a panel with the shared {@link SearchAutocomplete}
 * (TASK-411). The "Каталог" segment stays at every width this widget exists at;
 * below `lg` it opens the menu sheet with its step-by-step catalog, since the
 * mega menu needs ≈700px (TASK-2072).
 */
export function HeaderSearch({
  renderCatalogMenu,
  onOpenMenu,
}: HeaderSearchProps = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // SSR-stable ids (never random) for the two panels' aria-controls.
  const uid = useId();
  const compactPanelId = `${uid}-compact-panel`;
  const catalogPanelId = `${uid}-catalog-panel`;

  // The pill's own autocomplete instance — the same hook the compact panel and
  // the mobile menu run through `SearchAutocomplete` (TASK-805).
  const search = useSearchAutocomplete();
  const searchOpen = search.isOpen;
  const [catalogOpen, setCatalogOpen] = useState(false);
  /** Below `lg`: the magnifier's drop-down panel (TASK-411). */
  const [compactOpen, setCompactOpen] = useState(false);

  // Warm the category tree on mount (TASK-082) so the panel opens filled: the
  // mega menu, the sheet's catalog and the device bar read this cached query.
  useCategoryControllerGetCategoryTree();

  // Escape hands focus back to whichever trigger opened the panel.
  const catalogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const compactTriggerRef = useRef<HTMLButtonElement | null>(null);

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
      //
      // Deliberately NOT `relative` (TASK-2072): the catalog panel below
      // positions against the header row. `z-40` still lifts the whole widget
      // — a flex item with a z-index stacks without being positioned.
      className="z-40 hidden md:block lg:max-w-2xl lg:min-w-0 lg:flex-1"
    >
      {/* The pill's own positioning box: the suggestions popup and the
          compact search panel hang off the pill itself. */}
      <div className="relative">
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
                search.close();
                // The magnifier's panel is a peer dropdown: leaving it open
                // would stack two panels and report aria-expanded from two
                // triggers at once. Opening either closes the other (TASK-411).
                setCompactOpen(false);
                // Below `lg` there is no room for the mega menu (≈700px):
                // the menu sheet carries the step-by-step catalog instead.
                if (!isMegaMenuViewport()) {
                  setCatalogOpen(false);
                  onOpenMenu?.();
                  return;
                }
                setCatalogOpen((v) => !v);
              }}
              aria-expanded={catalogOpen}
              aria-controls={catalogPanelId}
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

            {/* Compact trigger (md–lg) — opens the search panel below. `w-12`
                on a 48px-tall pill is a 48×48 touch target. */}
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

        {/* Suggestions dropdown (anchored to the full pill) — the shared
            popup, so the pill and the stand-alone fields cannot drift apart
            (TASK-805). */}
        {search.showSuggestions && (
          <SearchSuggestionsPopup
            model={search.popup}
            className="absolute top-[calc(100%+8px)] right-0 left-0 z-50"
          />
        )}
      </div>

      {/* Catalog panel (TASK-2072). Anchored to the header row (`top-full` of
          the 64px row = the pill's bottom + 8px) and inset by the page
          container's padding, so its left edge lines up with the logo. A
          short laptop screen scrolls the panel itself; the page behind is
          locked. Never rendered below `lg` — the trigger opens the sheet
          there — `lg:block` is belt and braces for a resize while open. */}
      {catalogOpen && (
        <div
          id={catalogPanelId}
          role="group"
          aria-label={dict.header.catalogAria}
          className="absolute top-full left-4 z-50 hidden max-h-sticky-aside w-max max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain rounded-panel border border-border bg-popover p-2 shadow-lift sm:left-6 lg:left-8 lg:block"
        >
          {renderCatalogMenu?.({ onClose: () => setCatalogOpen(false) })}
        </div>
      )}
    </div>
  );
}
