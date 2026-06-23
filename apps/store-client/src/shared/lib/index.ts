// Shared Lib — Utility functions and helpers
// Re-export utilities here as they are created
export * from "./schema";
export * from "./format";
export * from "./product-gradient";
// NOTE: `use-debounced-callback` is a client-only hook ("use client"). It is
// intentionally NOT re-exported here — adding a client module to this barrel,
// which server components also import (e.g. for `formatMoney`), splits the
// module graph and breaks React Query's context during SSR. Import it directly:
//   import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
