import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scale, so it would treat the
 * storefront's role radii (`rounded-card` / `rounded-cta` / `rounded-menu`,
 * declared in `@theme inline` — design-system.md §5) as unrelated classes and
 * keep a component's default `rounded-xl` next to them. Tailwind v4 emits the
 * radius utilities alphabetically, so the default would then win in the
 * cascade. Registering the names makes them conflict like any other radius.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "cta", "menu", "pad", "panel"],
      // `ease-standard` (TASK-2079) — the easing of every state change.
      ease: ["standard"],
    },
    // `border-chip` (the 1.5px chip outline, a `@utility` in globals.css) is a
    // border WIDTH. Unregistered, tailwind-merge reads any `border-<word>` as a
    // border colour and drops it next to `border-border` / `border-primary` —
    // the chip silently lost its outline (TASK-217).
    classGroups: {
      "border-w": [{ border: ["chip"] }],
      // `transition-interactive` (TASK-2079, a `@utility` in globals.css) is a
      // transition PROPERTY set: registered, it replaces a component's
      // `transition-colors` / `transition-all` instead of sitting beside it.
      transition: [{ transition: ["interactive"] }],
    },
  },
});

/**
 * Merge Tailwind CSS classes with clsx conditional logic.
 * Uses tailwind-merge to intelligently deduplicate conflicting classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
