// Shared Lib — Utility functions and helpers
export { cn } from "./utils";
export * from "./format";
export { slugify } from "./slug";
export { nullableTextField } from "./nullable-text-field";
export { apiErrorMessage, apiErrorStatus } from "./api-error-message";

// NOTE: `use-debounced-callback` is intentionally NOT re-exported here. It is a
// "use client" hook; adding a client module to this barrel (which server
// components also import) splits the module graph and breaks the React Query
// context during SSR. Import it directly:
//   import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
//
// The same applies to the other client hooks in this folder — import each from
// its own module, never from here:
//   use-table-sort, use-media-query, use-row-selection, list-reorder/*
