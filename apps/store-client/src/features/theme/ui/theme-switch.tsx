"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/** Same hydration gate as `theme-toggle.tsx`: `false` on the server, `true` on the client. */
const neverChanges = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * The EFFECTIVE theme — what is painted, not what was stored — and a toggle
 * to its opposite (TASK-2073).
 *
 * `resolvedTheme`, not `theme`: a visitor on «Системна» with a dark OS sees a
 * dark page, so the control must show the moon and offer light. The first
 * click turns that implicit system theme into an explicit choice; the way back
 * to «Системна» is the radiogroup in the account card «Оформлення».
 *
 * `isDark` is `null` until hydration: the server cannot know the OS scheme or
 * localStorage, so every value derived from it (the button's name, the
 * switch's `aria-checked`) waits, while the visuals use the `dark:` variant,
 * which follows the same rule as the page and is right from the first paint.
 */
function useEffectiveTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    neverChanges,
    hydratedSnapshot,
    serverSnapshot,
  );
  const isDark = hydrated && resolvedTheme ? resolvedTheme === "dark" : null;

  function toggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return { isDark, toggle };
}

/**
 * Both icons, swapped by the `dark:` variant rather than by state: the project's
 * `@custom-variant dark` follows `data-theme` and, with nothing chosen, the OS —
 * so the right glyph is painted before next-themes hydrates, with no flash.
 */
function EffectiveThemeIcon() {
  return (
    <>
      <Sun className="size-5 shrink-0 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-5 shrink-0 dark:block" aria-hidden="true" />
    </>
  );
}

export interface ThemeToggleButtonProps {
  className?: string;
}

/**
 * ThemeToggleButton — the header's one-button theme switch (TASK-2073).
 *
 * Replaces the three-segment pill (126px) with a 44×44 button showing the
 * effective theme's icon; that frees ~82px of the 1280 row for the search
 * input (TASK-2286). Its name says what a click WILL do — «Увімкнути темну
 * тему» on a light page — so there is no `aria-pressed`: the action, not a
 * state, is what is announced. Before hydration the name is the neutral
 * «Тема оформлення»; the box is identical, so nothing shifts when it settles.
 */
export function ThemeToggleButton({ className }: ThemeToggleButtonProps) {
  const { isDark, toggle } = useEffectiveTheme();
  const label =
    isDark === null
      ? dict.theme.groupAria
      : isDark
        ? dict.theme.enableLight
        : dict.theme.enableDark;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-shadow duration-200 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        className,
      )}
    >
      <EffectiveThemeIcon />
    </button>
  );
}

export interface ThemeSwitchRowProps {
  className?: string;
}

/**
 * ThemeSwitchRow — «Темна тема» with a switch, for the slide-out menu (TASK-2073).
 *
 * The WHOLE row is the `role="switch"` button, not just the track: a 48px-tall
 * full-width target on a phone, and one accessible name («Темна тема», the
 * visible text — icon and track are `aria-hidden`). Space / Enter toggle it
 * natively. `aria-checked` is the effective theme, so a dark OS with no choice
 * made reads as ON. The track's visual state is driven by `dark:` for the same
 * no-flash reason as the icon; it mirrors the my-devices switch (52×32, thumb
 * 26, travel 20).
 */
export function ThemeSwitchRow({ className }: ThemeSwitchRowProps) {
  const { isDark, toggle } = useEffectiveTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark === true}
      onClick={toggle}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <EffectiveThemeIcon />
      <span className="flex-1">{dict.theme.darkRow}</span>
      <span
        aria-hidden="true"
        data-slot="theme-switch-track"
        className="relative h-8 w-13 shrink-0 rounded-full bg-muted transition-colors duration-150 ease-out motion-reduce:transition-none dark:bg-primary"
      >
        <span className="absolute top-0.75 left-0.75 size-6.5 rounded-full bg-card shadow-card transition-transform duration-150 ease-out motion-reduce:transition-none dark:translate-x-5" />
      </span>
    </button>
  );
}
