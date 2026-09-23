// design-sync bundle prelude — wired as cfg.extraEntries[0], so it evaluates
// before every component module in _ds_bundle.js. Two jobs:
//
// 1. `process` polyfill (defensive). No admin shared/ui module reads
//    process.env at load today, but a standalone browser bundle has no
//    `process`, and one new `process.env.NEXT_PUBLIC_*` read would blank every
//    card with "process is not defined" (it happened on the storefront sync).
//
// 2. Pin the light theme unless the page chose one. The admin's globals.css
//    switches every token to dark under a bare `prefers-color-scheme: dark`;
//    compile-css.mjs rewrites that block to `:root:not([data-theme="light"])`
//    and adds a `:root[data-theme="dark"]` twin, so this attribute is what
//    keeps preview cards and design canvases (fixed white background) readable
//    on a dark-OS viewer. Designs opt into dark with <html data-theme="dark">.
const g = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
  document?: Document;
};
g.process ??= { env: {} };
const root = g.document?.documentElement;
if (root && !root.hasAttribute("data-theme")) root.setAttribute("data-theme", "light");
export {};
