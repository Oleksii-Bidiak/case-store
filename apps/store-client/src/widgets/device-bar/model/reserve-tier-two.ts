import { MY_DEVICES_STORAGE_KEY } from "@/entities/my-devices";

/**
 * Set on <html> before first paint when the shopper has a saved device
 * (TASK-2074). The pre-hydration placeholder uses it to reserve tier 2's 52px
 * at ≥ 1024, so a returning desktop shopper's page does not jump down when
 * the real tier 2 renders after hydration (no CLS).
 */
export const HAS_DEVICE_ATTR = "data-has-device";

/**
 * Inline, parser-blocking script rendered with the placeholder. It runs while
 * the header HTML is parsed — before the reservation row below it is painted —
 * and only reads localStorage: nothing personal is in the cached HTML, and the
 * attribute is the only trace it leaves. Any failure (no storage, bad JSON)
 * means "no device": the worst case is the shift we had before, never an
 * error. `<html>` carries `suppressHydrationWarning` (next-themes), so the
 * extra attribute does not trip hydration.
 */
export const RESERVE_TIER_TWO_SCRIPT = `(function(){try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(
  MY_DEVICES_STORAGE_KEY,
)})||"[]");if(Array.isArray(v)&&v.length>0)document.documentElement.setAttribute(${JSON.stringify(
  HAS_DEVICE_ATTR,
)},"")}catch(e){}})();`;
