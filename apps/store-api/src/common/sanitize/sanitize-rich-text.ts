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
 * are restricted to `http`/`https` sources and base64 raster `data:` images
 * (never `data:text/html` or `data:image/svg+xml`); table cells keep `colspan`
 * and `rowspan` (structure, not presentation) and nothing else.
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
    // Merged cells (TASK-434). These two are the ONLY attributes that carry
    // table structure rather than presentation: strip them and a 2×2 header
    // spanning both columns silently becomes a 1-column header on the next
    // save, with no error anywhere and no way back. Everything else a cell can
    // carry (style, class, width, on*) stays off the list on purpose — the
    // admin editor never emits it, and vendor HTML from the catalogue import
    // is exactly the untrusted input this policy exists to flatten.
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
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
  // An `<img>` whose source did not pass {@link isAllowedImageSrc} is dropped
  // WHOLE. Leaving it with the src stripped would store a sourceless image —
  // an empty box on the page, and no content anyone can edit back.
  exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedImageSrc(frame.attribs.src),
  // Drop the CONTENTS of these tags too, not just the tags themselves, so a
  // stripped <script>alert(1)</script> leaves no dangling text payload behind.
  nonTextTags: ['script', 'style', 'textarea', 'noscript'],
};

/**
 * The only `data:` images that survive (TASK-571): a base64 raster in one of
 * the formats a browser renders as an inert picture. `image/svg+xml` is out on
 * purpose — it is a document, not a picture — as is every non-image type, and
 * a non-base64 payload (which could smuggle markup) is out as well.
 */
const DATA_IMAGE_SRC = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]*={0,2}$/i;

/**
 * Browsers drop ASCII whitespace and control characters inside a URL before
 * reading its scheme, so `da\nta:` is `data:` to them. sanitize-html strips the
 * same range before its own scheme check; the classification below has to see
 * the URL the way both of them do.
 */
const URL_INVISIBLES = /[\x00-\x20]+/g;

/**
 * Whether an `<img>` source (already scheme-checked by sanitize-html) may stay.
 */
function isAllowedImageSrc(src: string | undefined): boolean {
  if (!src) {
    return false;
  }
  const normalized = src.replace(URL_INVISIBLES, '');
  if (/^data:/i.test(normalized)) {
    return DATA_IMAGE_SRC.test(normalized);
  }
  return true;
}

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
