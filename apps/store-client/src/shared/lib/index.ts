// Shared Lib — Utility functions and helpers
// Re-export utilities here as they are created
export * from "./schema";
export * from "./format";
export * from "./product-gradient";
export * from "./product-pricing";
export * from "./color-swatch";
// Vendor-agnostic analytics facade (TASK-261). Safe to re-export here — a plain
// module with no "use client" and no React import, unlike the intentionally
// excluded client-only `use-debounced-callback` noted below.
export * from "./analytics";
// Reader for failed API responses (TASK-402) — same reasoning as `analytics`:
// a plain module with no React import, so the barrel stays server-safe.
export * from "./api-error";
// NOTE: `use-debounced-callback` is a client-only hook ("use client"). It is
// intentionally NOT re-exported here — adding a client module to this barrel,
// which server components also import (e.g. for `formatMoney`), splits the
// module graph and breaks React Query's context during SSR. Import it directly:
//   import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
