import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's own scales. The project's `@theme`
 * tokens (app/globals.css) must be declared here too, or a token is read as
 * something else — `text-control` as a COLOUR — and `cn("md:text-sm",
 * "md:text-control")` keeps both, leaving the winner to CSS source order.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "pill", "control"],
      shadow: ["card", "elevated", "lift", "bar"],
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
