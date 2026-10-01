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
      radius: ["card", "cta", "menu"],
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
