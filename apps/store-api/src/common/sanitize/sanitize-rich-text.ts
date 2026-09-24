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
 * `rel="noopener noreferrer"` (plus `nofollow` when they leave the store) and
 * restricted to safe schemes; images
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
  // Drop the CONTENTS of these tags too, not just the tags themselves, so a
  // stripped <script>alert(1)</script> leaves no dangling text payload behind.
  nonTextTags: ['script', 'style', 'textarea', 'noscript'],
};

/**
 * Where the sanitizer's origin-dependent rules get their origins from. Every
 * field is optional and defaults to the process environment, so the
 * one-argument call — which every write path and the seed use — keeps working
 * and reads the deployment's own values. Tests pass them explicitly.
 */
export interface RichTextSanitizeOptions {
  /**
   * The storefront origin. A link to it is internal and gets no `nofollow`.
   * Default `STORE_CLIENT_URL`; `null` (or an unset/unparseable value) means
   * "unknown", and then every absolute link is treated as external.
   */
  siteOrigin?: string | null;
}

/** The options with defaults applied, normalised once per call. */
interface ResolvedSanitizeOptions {
  siteOrigin: string | undefined;
}

/**
 * The `http(s)` origin of a configured URL, lower-cased by the URL parser, or
 * undefined for anything unset, unparseable or on another scheme.
 */
function httpOrigin(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function resolveOptions(options: RichTextSanitizeOptions | undefined): ResolvedSanitizeOptions {
  return {
    siteOrigin: httpOrigin(
      options?.siteOrigin !== undefined ? options.siteOrigin : process.env.STORE_CLIENT_URL,
    ),
  };
}

/**
 * Base for resolving relative URLs. `.invalid` is reserved (RFC 2606) and can
 * never be a real host, so "resolved onto this origin" means "was relative".
 */
const RELATIVE_BASE = 'https://relative.invalid';
const RELATIVE_ORIGIN = new URL(RELATIVE_BASE).origin;

/**
 * Whether a link leaves the store (TASK-575): an absolute `http(s)` URL on an
 * origin other than the storefront's. Relative paths, `#anchors` and same-origin
 * absolute URLs are internal; `mailto:` is not a page at all. With the store
 * origin unknown, every absolute link is external — `nofollow` on an internal
 * link loses link equity, but a missing one on a paid or untrusted link is the
 * worse error. An href the URL parser rejects is treated as external too.
 */
function isExternalLink(href: string | undefined, siteOrigin: string | undefined): boolean {
  if (!href) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(href, RELATIVE_BASE);
  } catch {
    return true;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false;
  }
  if (url.origin === RELATIVE_ORIGIN) {
    return false;
  }
  return url.origin !== siteOrigin;
}

/**
 * The full policy for one call: the static allow-list plus the rules that
 * depend on the deployment's origins.
 */
function buildPolicy(options: ResolvedSanitizeOptions): sanitizeHtml.IOptions {
  return {
    ...RICH_TEXT_POLICY,
    transformTags: {
      // Force rel on every anchor regardless of the incoming markup.
      // `noopener noreferrer` always — it hardens `target="_blank"` and keeps
      // the referrer to ourselves. `nofollow` only where the link leaves the
      // store (TASK-575): on an internal link it throws link equity away.
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: isExternalLink(attribs.href, options.siteOrigin)
            ? 'noopener noreferrer nofollow'
            : 'noopener noreferrer',
        },
      }),
    },
    // An `<img>` whose source did not pass {@link isAllowedImageSrc} is dropped
    // WHOLE. Leaving it with the src stripped would store a sourceless image —
    // an empty box on the page, and no content anyone can edit back.
    exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedImageSrc(frame.attribs.src),
  };
}

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
 * @param options Origins for the origin-dependent rules; every field defaults
 *   to the process environment, so callers normally pass nothing.
 * @returns A sanitized HTML string containing only allow-listed markup.
 */
export function sanitizeRichText(html: string, options?: RichTextSanitizeOptions): string {
  if (!html) {
    return '';
  }
  return sanitizeHtml(html, buildPolicy(resolveOptions(options)));
}
