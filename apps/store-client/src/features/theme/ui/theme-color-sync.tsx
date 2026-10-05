"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { THEME_COLOR } from "@/shared/config";

/** Marks the one `<meta name="theme-color">` this component owns. */
export const THEME_COLOR_OVERRIDE_ATTR = "data-theme-color-override";

/**
 * ThemeColorSync — keeps the browser chrome on the theme the visitor CHOSE
 * (TASK-506, tail of TASK-412). Renders nothing.
 *
 * The root layout's `viewport.themeColor` is a static pair keyed on
 * `prefers-color-scheme`. That is right for first paint and for «Системна»:
 * the browser switches it with the OS, no JavaScript involved. It cannot know
 * about an explicit choice, though — «Світла» on a dark OS left the address bar
 * dark over a light page.
 *
 * The fix leans on the HTML rule for picking a theme colour: the FIRST
 * `<meta name="theme-color">` in tree order whose `media` matches wins. On an
 * explicit light/dark choice we put our own media-less meta at the top of
 * `<head>`, so it always matches and outranks the pair; on «Системна» it is
 * removed and the pair takes over again. The Next-rendered tags are never
 * mutated — React owns them, and a soft navigation could quietly undo an edit.
 *
 * `theme` (the stored choice) drives this, not `resolvedTheme`: "system" must
 * hand control back to the media pair, which then follows live OS changes.
 * Before hydration `theme` is already the stored value (next-themes seeds it
 * from localStorage), so the override lands on the first client effect.
 */
export function ThemeColorSync() {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme !== "light" && theme !== "dark") return;

    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = THEME_COLOR[theme];
    meta.setAttribute(THEME_COLOR_OVERRIDE_ATTR, "");
    // First in <head>: tree order is what makes it outrank the media pair.
    document.head.prepend(meta);

    // A new choice, «Системна» or unmount — each hands the chrome back first.
    return () => meta.remove();
  }, [theme]);

  return null;
}
