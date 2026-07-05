import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list policy for rich-text HTML produced by the admin Tiptap editor.
 *
 * This is intentionally framework-agnostic (a plain function, not a Nest
 * provider) so ANY module that persists Tiptap output — static Pages today,
 * the blog and banners later — can import and reuse it with a trivial import.
 *
 * Security posture: everything not on the allow-list is stripped. That removes
 * `<script>`, `<style>`, `<iframe>`, and every `on*` inline event handler, plus
 * any tag/attribute we do not explicitly permit. Links are forced to
 * `rel="noopener noreferrer nofollow"` and restricted to safe schemes; images
 * are restricted to `http`/`https`/`data` sources.
 */
const RICH_TEXT_POLICY: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
  },
  // Only these URL schemes survive on hrefs / srcs; `javascript:` and other
  // dangerous schemes are dropped entirely.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  allowProtocolRelative: false,
  // Force safe rel on every anchor regardless of the incoming markup — this
  // both hardens `target="_blank"` links and strips SEO/link-equity leakage.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'noopener noreferrer nofollow',
      },
    }),
  },
  // Drop the CONTENTS of these tags too, not just the tags themselves, so a
  // stripped <script>alert(1)</script> leaves no dangling text payload behind.
  nonTextTags: ['script', 'style', 'textarea', 'noscript'],
};

/**
 * Sanitize untrusted rich-text HTML down to the {@link RICH_TEXT_POLICY}
 * allow-list. Pure and side-effect free — safe to call on every write path.
 *
 * @param html Raw HTML (typically Tiptap editor output from an admin).
 * @returns A sanitized HTML string containing only allow-listed markup.
 */
export function sanitizeRichText(html: string): string {
  if (!html) {
    return '';
  }
  return sanitizeHtml(html, RICH_TEXT_POLICY);
}
