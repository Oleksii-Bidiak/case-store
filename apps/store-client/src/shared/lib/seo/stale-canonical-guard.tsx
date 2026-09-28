"use client";

import { useEffect } from "react";

/**
 * Removes a canonical `<link>` the server rendered but React never took over
 * (TASK-835).
 *
 * ── The race ────────────────────────────────────────────────────────────────
 * React hydrates the page in pieces. The filter checkbox can become clickable
 * a few hundred milliseconds BEFORE the part of the tree that owns the metadata
 * tags is hydrated (measured on `next dev`: ~150–200 ms; longer on a slow
 * phone). If the shopper ticks a facet inside that window, the navigation
 * client-renders the metadata afresh: React inserts the NEW canonical but has
 * no record of the server-rendered OLD one (it was never hydrated, so React
 * does not own it), and nothing ever removes it. The live `<head>` then holds
 * two canonicals for as long as the page stays open — reproduced by
 * `e2e/compat-robots.spec.ts`. After hydration the same navigation is clean:
 * React swaps its own tag in one commit.
 *
 * Crawlers never see this — they load every URL fresh and read the server HTML
 * (asserted in the same spec) — but the live document should say one thing.
 *
 * ── Why removing a node here is safe ────────────────────────────────────────
 * The guard acts only once a canonical with the EXPECTED href is present. That
 * tag is written by the same commit that unmounts every canonical React owns
 * for the previous view, and a MutationObserver callback runs only after that
 * whole synchronous commit — so by then any canonical with a different href is
 * one React does not own. React's own lookup cache of server-rendered tags is
 * rebuilt at the start of every commit, so a node removed between commits is
 * never handed back to it.
 *
 * Only canonicals, on purpose: a `robots` tag may also come from the root
 * layout's site-wide kill switch, which this component cannot see, so "not the
 * one I expect" does not mean "stale" there.
 */
export function pruneStaleCanonicals(
  head: HTMLHeadElement,
  href: string,
): boolean {
  const links = Array.from(
    head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'),
  );
  if (!links.some((link) => link.getAttribute("href") === href)) return false;
  for (const link of links) {
    if (link.getAttribute("href") !== href) link.remove();
  }
  return true;
}

export interface StaleCanonicalGuardProps {
  /** The absolute canonical URL this render's metadata emits. */
  href: string;
}

/**
 * Render next to a page whose metadata emits `href` as its canonical. Renders
 * nothing; after mount (and after every change of `href`) it waits for that
 * canonical to reach `<head>` and then drops any other one.
 */
export function StaleCanonicalGuard({ href }: StaleCanonicalGuardProps) {
  useEffect(() => {
    const head = document.head;
    if (pruneStaleCanonicals(head, href)) return;
    // Metadata is streamed after the page body, so the new tag may arrive in a
    // later commit than this effect.
    const observer = new MutationObserver(() => {
      if (pruneStaleCanonicals(head, href)) observer.disconnect();
    });
    observer.observe(head, { childList: true });
    return () => observer.disconnect();
  }, [href]);

  return null;
}
