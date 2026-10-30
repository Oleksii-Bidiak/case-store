"use client";

import { useEffect, useRef } from "react";

/** Why the hash was reported: on mount, or because it changed afterwards. */
export type HashNavigationSource = "mount" | "change";

/**
 * Reports the URL hash (without `#`, decoded; "" when there is none) on mount
 * and every time it changes afterwards (TASK-1992, TASK-1670).
 *
 * `hashchange` alone is not enough in the App Router: a `<Link href="/x#y">`
 * clicked while already on /x prevents the default and calls `pushState`,
 * which fires no `hashchange` — the URL changes and the page never hears of
 * it. So three sources are watched:
 *   - `hashchange` — a plain `<a href="#y">`, a typed URL, back/forward;
 *   - `popstate` — back/forward between entries Next pushed itself;
 *   - a capture-phase click on a same-page link with a hash — Next's own
 *     hash navigation. The hash is read from the link, since Next pushes the
 *     URL only once its transition commits.
 * A modified click (new tab / window), a `target`ed link, and a history
 * change to another pathname change nothing here and are ignored.
 *
 * The mount read is deferred a frame, so a page that renders its default
 * state on the server hydrates without a mismatch and adopts the hash after.
 * The listener may be called again with the hash it already has; it should
 * be idempotent.
 */
export function useHashNavigation(
  onHash: (hash: string, source: HashNavigationSource) => void,
): void {
  const onHashRef = useRef(onHash);

  // Keep the ref current without re-subscribing on every render.
  useEffect(() => {
    onHashRef.current = onHash;
  });

  useEffect(() => {
    const report = (hash: string, source: HashNavigationSource) =>
      onHashRef.current(decodeHash(hash), source);

    const raf = requestAnimationFrame(() =>
      report(window.location.hash, "mount"),
    );
    // Back/forward to another page is that page's business: this one is about
    // to unmount and must not switch or scroll on the way out.
    const pathname = window.location.pathname;
    const onLocation = () => {
      if (window.location.pathname === pathname) {
        report(window.location.hash, "change");
      }
    };
    const onClick = (event: MouseEvent) => {
      const hash = samePageLinkHash(event);
      if (hash !== null) report(hash, "change");
    };

    window.addEventListener("hashchange", onLocation);
    window.addEventListener("popstate", onLocation);
    window.addEventListener("click", onClick, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onLocation);
      window.removeEventListener("popstate", onLocation);
      window.removeEventListener("click", onClick, true);
    };
  }, []);
}

function decodeHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The hash a plain click would navigate to on this same page, else null. */
function samePageLinkHash(event: MouseEvent): string | null {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download"))
    return null;

  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return null;
  }
  if (
    url.origin !== window.location.origin ||
    url.pathname !== window.location.pathname ||
    !url.hash
  ) {
    return null;
  }
  return url.hash;
}
