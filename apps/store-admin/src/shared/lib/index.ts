// Shared Lib — Utility functions and helpers
export { cn } from "./utils";
export * from "./format";
export { slugify } from "./slug";
export { nullableTextField } from "./nullable-text-field";
export { apiErrorMessage, apiErrorStatus } from "./api-error-message";
export {
  PASSWORD_MIN_LENGTH,
  CUSTOMER_PASSWORD_REGEX,
  STAFF_PASSWORD_REGEX,
  isStaffPassword,
  isCustomerPassword,
} from "./password-policy";
// TASK-426. Pure logic, no "use client" — safe in this barrel. The MASKED INPUT
// that uses it is not: import it as `@/shared/ui/phone-input`.
//
// Both rules are exported, and which one a field needs is NOT a style choice:
// order fields (delivery address, guest contact) are validated by the API with
// @IsInternationalPhone, because an operator taking an order by phone is
// legitimately handed a roaming or border-region number (TASK-338, restated by
// the owner 2026-09-10). Exporting only the UA rule here is what would nudge the
// next author into re-creating the mismatch: a form stricter than the server
// rejects input the API would have accepted, with no way for the operator to
// tell why.
export {
  UA_PHONE_LOCAL_LENGTH,
  UA_PHONE_PATTERN,
  PHONE_MIN_DIGITS,
  PHONE_MAX_DIGITS,
  formatUAPhone,
  normalizeUAPhone,
  isValidUAPhone,
  isValidInternationalPhone,
} from "./phone";
// TASK-487. Pure logic, no "use client" — safe in this barrel. Reads the colour
// out of a product's free-form variant-axis JSON so the bulk colour dialog can
// offer the spellings already in use.
export {
  COLOR_AXIS_KEYS,
  isColorAxis,
  readColorAxis,
  colorsInUse,
} from "./color-axis";

// NOTE: `use-debounced-callback` is intentionally NOT re-exported here. It is a
// "use client" hook; adding a client module to this barrel (which server
// components also import) splits the module graph and breaks the React Query
// context during SSR. Import it directly:
//   import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
//
// The same applies to the other client hooks in this folder — import each from
// its own module, never from here:
//   use-table-sort, use-url-params, use-media-query, use-row-selection,
//   list-reorder/*
