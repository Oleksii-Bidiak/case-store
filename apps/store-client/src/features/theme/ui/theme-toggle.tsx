"use client";

import { useId, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * The three states in reading order: light → system → dark. "System" sits in
 * the middle on purpose — it is the neutral default the storefront ships with,
 * and the two explicit choices flank it like the ends of a slider.
 *
 * The labels are NOT new copy: they are the same three strings the account
 * settings section names, so the two surfaces can never drift apart.
 */
const THEME_OPTIONS = [
  { value: "light", label: dict.account.dashboard.themeLight, Icon: Sun },
  { value: "system", label: dict.account.dashboard.themeSystem, Icon: Monitor },
  { value: "dark", label: dict.account.dashboard.themeDark, Icon: Moon },
] as const;

/**
 * "Have we hydrated yet?" as an external store (same shape as
 * `shared/lib/use-reduced-motion.ts`): the server snapshot is `false`, the
 * client's `true`, and nothing ever changes afterwards — hence the no-op
 * `subscribe`. Preferred over a `useState` + `useEffect(() => setMounted(true))`
 * pair, which React flags as a cascading render (and ESLint rejects outright).
 */
const neverChanges = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export interface ThemeToggleProps {
  /**
   * `compact` (default) — icon-only segments sized for the header action
   * cluster. `full` — labelled, full-width segments under a visible caption,
   * for the mobile slide-out menu and the account settings card, where there is
   * room and no icon vocabulary to lean on.
   */
  variant?: "compact" | "full";
  /**
   * Drop the visible caption while keeping it as the group's accessible name.
   * For hosts that title the control themselves: the account settings card
   * already heads the card «Оформлення» and explains it in a line of copy, so a
   * third «Тема оформлення» above the pill would only repeat them.
   */
  hideLabel?: boolean;
  className?: string;
}

/**
 * ThemeToggle — the light / system / dark switch (TASK-412).
 *
 * It lives in `features/`, not `shared/ui`: it does not merely render, it reads
 * and writes a persisted visitor preference (localStorage, through next-themes),
 * and that is the line between the two layers. It started inside
 * `widgets/header`, where the account page could not reach it without a lateral
 * widget→widget import — the move down is TASK-505.
 *
 * A segmented control rather than a one-button cycle: with three states a cycle
 * hides both where you are and where the next press lands, and "system" is
 * indistinguishable from whichever theme it currently resolves to.
 *
 * Semantics are a radio group, which is what a "pick exactly one of three" is:
 * `role="radiogroup"` named by the caption, `role="radio"` + `aria-checked` per
 * segment, roving `tabIndex` so the group is ONE tab stop, and ←/→/↑/↓ (plus
 * Home/End) moving the selection the way native radios do.
 *
 * Until hydration nothing is highlighted. `useTheme()` returns `undefined` on the
 * server and on the first client render — the choice lives in localStorage,
 * which the server cannot see — so highlighting a guess would either mismatch
 * hydration or visibly jump from "Системна" to the real answer a frame later.
 * The markup is identical either way, so only the highlight arrives late.
 * (The PAGE itself does not wait for this: next-themes' inline script sets
 * `data-theme` on `<html>` before first paint.)
 *
 * `theme` — the stored CHOICE — drives the highlight, not `resolvedTheme`:
 * a visitor who picked "Системна" must see that, not the dark it resolved to.
 */
export function ThemeToggle({
  variant = "compact",
  hideLabel = false,
  className,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    neverChanges,
    hydratedSnapshot,
    serverSnapshot,
  );
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();

  const selectedIndex = hydrated
    ? THEME_OPTIONS.findIndex((option) => option.value === theme)
    : -1;

  const isFull = variant === "full";
  const captionVisible = isFull && !hideLabel;

  function select(index: number) {
    const option = THEME_OPTIONS[index];
    if (!option) return;
    setTheme(option.value);
    // Keyboard selection must carry focus with it — otherwise the next arrow
    // press starts from a segment the user can no longer see they are on.
    buttonsRef.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const count = THEME_OPTIONS.length;
    // With nothing selected yet (pre-hydration) the first segment is the anchor —
    // it is also the one holding the group's tab stop.
    const from = selectedIndex === -1 ? 0 : selectedIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        select((from + 1) % count);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        select((from - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        select(0);
        break;
      case "End":
        event.preventDefault();
        select(count - 1);
        break;
    }
  }

  return (
    <div className={cn(isFull && "flex flex-col gap-1.5", className)}>
      {/* One accessible name: a caption in the slide-out menu, and
          screen-reader-only in the header, where the icons carry the meaning —
          and in any host that titles the control itself (`hideLabel`). */}
      <span
        id={labelId}
        className={cn(
          captionVisible
            ? "px-1 text-xs font-medium text-muted-foreground"
            : "sr-only",
        )}
      >
        {dict.header.themeAria}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center rounded-full border border-border bg-muted p-0.5",
          isFull && "w-full",
        )}
      >
        {THEME_OPTIONS.map((option, index) => {
          const selected = index === selectedIndex;
          const { Icon } = option;
          // Two different contrast floors: in `full` this class also paints a
          // 12px LABEL, which owes 4.5:1 — `muted-foreground` on the `muted`
          // track measures 4.34:1 and would miss it. In `compact` it paints an
          // icon only, a UI component at 3:1, where muted is the right weight.
          const unselectedClass = isFull
            ? "text-foreground/80 hover:text-foreground"
            : "text-muted-foreground hover:text-foreground";

          return (
            <button
              key={option.value}
              ref={(node) => {
                buttonsRef.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tab stop: the group is one Tab away, arrows do the rest.
              // Until the stored choice is known, the first segment holds it.
              tabIndex={
                selected || (selectedIndex === -1 && index === 0) ? 0 : -1
              }
              onClick={() => select(index)}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // `h-11` in the menu: a phone target. `size-10` in the header:
                // a pointer-width surface that keeps the pill itself at 44px.
                isFull ? "h-11 min-w-0 flex-1 text-xs font-medium" : "size-10",
                selected
                  ? "bg-background text-primary shadow-card"
                  : unselectedClass,
              )}
            >
              <Icon
                className={isFull ? "size-4 shrink-0" : "size-5"}
                aria-hidden="true"
              />
              {/* The label is the segment's accessible name in both variants —
                  visible in the menu, sr-only next to the icon in the header. */}
              <span className={cn("truncate", !isFull && "sr-only")}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
