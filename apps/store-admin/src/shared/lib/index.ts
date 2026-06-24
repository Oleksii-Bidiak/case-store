// Shared Lib — Utility functions and helpers
export { cn } from "./utils";

// NOTE: `use-debounced-callback` is intentionally NOT re-exported here. It is a
// "use client" hook; adding a client module to this barrel (which server
// components also import) splits the module graph and breaks the React Query
// context during SSR. Import it directly:
//   import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
