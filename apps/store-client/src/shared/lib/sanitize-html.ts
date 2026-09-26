import DOMPurify from "isomorphic-dompurify";
import { withOpenerSafeRel } from "./link-rel";
import { TABLE_SPAN_ATTRIBUTES, clampTableSpan } from "./table-span";

/** Elements whose span attributes {@link clampTableSpan} bounds. */
const TABLE_SPAN_TAGS = new Set(["TD", "TH", "COL", "COLGROUP"]);

/**
 * The only `data:` images the API's sanitizer keeps (TASK-571): a base64
 * raster. Mirrors `DATA_IMAGE_SRC` in store-api's `sanitize-rich-text.ts`.
 */
const DATA_IMAGE_SRC =
  /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]*={0,2}$/i;

/** Browsers drop these inside a URL before reading its scheme. */
const URL_INVISIBLES = /[\x00-\x20]+/g;

// Harden admin-authored links: any `target="_blank"` gets `noopener noreferrer`
// so the opened page can't reach back via `window.opener` — added to the rel
// the API wrote, never replacing it, or the API's `nofollow` on external links
// would vanish (TASK-575). The hook is registered once at module load
// (DOMPurify hooks are global; re-adding on every call would stack duplicates).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", withOpenerSafeRel(node.getAttribute("rel")));
  }
  // Table spans are clamped to the range the API's sanitizer writes (TASK-548),
  // so a page body stored before that clamp cannot render `colspan="9999"`.
  if (TABLE_SPAN_TAGS.has(node.tagName)) {
    for (const name of TABLE_SPAN_ATTRIBUTES) {
      const value = node.getAttribute(name);
      if (value === null) continue;
      const clamped = clampTableSpan(name, value);
      if (clamped === null) node.removeAttribute(name);
      else node.setAttribute(name, clamped);
    }
  }
  // The CSP `img-src` allows any `data:` — it cannot tell a PNG from an SVG —
  // so a body stored before the API's raster-only rule (TASK-571) is held to
  // it here. Other hosts are the CSP's job and are left alone.
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src")?.replace(URL_INVISIBLES, "");
    if (src && /^data:/i.test(src) && !DATA_IMAGE_SRC.test(src)) {
      node.removeAttribute("src");
    }
  }
});

/**
 * Sanitize admin-authored HTML (Tiptap output) before it is rendered with
 * `dangerouslySetInnerHTML` on the storefront. `isomorphic-dompurify` runs on
 * both the server (via jsdom) and the browser, so this is safe in a server
 * component. Never render `page.content` without passing it through here first.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
