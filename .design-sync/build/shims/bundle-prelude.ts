// design-sync bundle prelude — wired as cfg.extraEntries[0], so it evaluates
// before every component module in _ds_bundle.js. Two jobs:
//
// 1. `process` polyfill. The standalone browser bundle has no `process`, while
//    site.ts and category-tile-image.tsx read process.env.NEXT_PUBLIC_* at
//    module load (Next inlines those at build time; here nothing does). An
//    empty env makes their fallbacks apply.
//
// 2. Pin the light theme unless the page chose one. globals.css switches every
//    token to dark under `prefers-color-scheme: dark` for
//    `:root:not([data-theme="light"])` — correct on the site, where the page
//    background follows the same tokens. Preview cards and many design
//    canvases paint a fixed white background, so a designer on a dark OS got
//    light text on white. Designs stay deterministic (light) by default and
//    opt into dark explicitly with <html data-theme="dark">, exactly like the
//    storefront's theme switcher.
const g = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
  document?: Document;
};
g.process ??= { env: {} };
const root = g.document?.documentElement;
if (root && !root.hasAttribute("data-theme")) root.setAttribute("data-theme", "light");
export {};
