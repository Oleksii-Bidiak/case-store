import DOMPurify from "isomorphic-dompurify";
import { withOpenerSafeRel } from "./link-rel";
import { TABLE_SPAN_ATTRIBUTES, clampTableSpan } from "./table-span";

/** Elements whose span attributes {@link clampTableSpan} bounds. */
const TABLE_SPAN_TAGS = new Set(["TD", "TH", "COL", "COLGROUP"]);

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
