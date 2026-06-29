import DOMPurify from "isomorphic-dompurify";

// Harden admin-authored links: any `target="_blank"` gets `rel="noopener
// noreferrer"` so the opened page can't reach back via `window.opener`. The hook
// is registered once at module load (DOMPurify hooks are global; re-adding on
// every call would stack duplicates).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
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
