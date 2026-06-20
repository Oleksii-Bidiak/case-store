/**
 * Stable placeholder gradients for products/categories that have no image yet.
 * Picked deterministically from a seed (slug or name) so the same product
 * always renders the same intentional-looking backdrop. Tailwind classes
 * (not raw hex) keep the palette centralised.
 */
export const PRODUCT_GRADIENTS = [
  "from-indigo-100 to-sky-100 text-indigo-300",
  "from-rose-100 to-orange-100 text-rose-300",
  "from-emerald-100 to-teal-100 text-emerald-300",
  "from-violet-100 to-fuchsia-100 text-violet-300",
  "from-amber-100 to-yellow-100 text-amber-400",
  "from-cyan-100 to-blue-100 text-cyan-300",
] as const;

/** Deterministically pick a gradient class string for a seed. */
export function pickProductGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PRODUCT_GRADIENTS[Math.abs(hash) % PRODUCT_GRADIENTS.length];
}
