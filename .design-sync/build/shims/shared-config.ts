// design-sync shim for `@/shared/config`. The storefront UI consumes `dict`
// and `SITE_NAME` (logo.tsx) from this barrel. The real barrel also pulls
// modules the UI never needs; re-export only what shared/ui imports.
// SITE_NAME is re-exported from the real site.ts (never copied — the brand
// name changes), with `process` polyfilled first because site.ts reads
// process.env at module load and would throw in the standalone bundle.
import "./bundle-prelude";
export { dict } from "@/shared/config/dictionary";
export { SITE_NAME } from "@/shared/config/site";
