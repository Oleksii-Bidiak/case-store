// design-sync shim for `@/shared/config`. The admin UI consumes only `dict`
// from this barrel. The real barrel also re-exports site.ts (storefront URLs
// from the environment) and hub-pages — nothing a presentational component
// needs. Re-exported from the real dictionary, never copied.
import "./bundle-prelude";
export { dict, type AdminDictionary } from "@/shared/config/dictionary";
