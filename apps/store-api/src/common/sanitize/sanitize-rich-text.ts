import sanitizeHtml from 'sanitize-html';

import { MAX_TABLE_COLSPAN, MAX_TABLE_ROWSPAN } from './rich-text.constants';

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
 * are restricted to the hosts the storefront CSP `img-src` allows — relative
 * paths, the API's uploads origin and the IMAGE_HOSTS allow-list — and base64
 * raster `data:` images (never `data:text/html` or `data:image/svg+xml`); an
 * image from anywhere else is dropped whole; table cells keep `colspan`
 * and `rowspan` (structure, not presentation) and nothing else, `col` and
 * `colgroup` keep only `span`, and every span is clamped to the documented
 * range in `rich-text.constants.ts` (TASK-548).
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
    // TASK-548: the rest of a real table. `caption` names it, `colgroup`/`col`
    // group its columns, `tfoot` holds its totals row. Without them a vendor
    // spec table from the catalogue import lost those parts on its first save.
    'caption',
    'colgroup',
    'col',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
  ],
  // `<col>` is a void element; without this it would be written back as
  // `<col></col>`, which an HTML parser reads as a stray end tag.
  selfClosing: [...sanitizeHtml.defaults.selfClosing, 'col'],
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
    //
    // Every span is also CLAMPED (TASK-548) — see {@link clampSpans}.
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    // How many columns a column group covers: structure again, and the only
    // thing a `<col>` says once its presentational `width`/`style` are gone.
    col: ['span'],
    colgroup: ['span'],
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
  /**
   * The API's public origin — where uploaded images are served from
   * (`<origin>/uploads/…`) and the API origin the storefront CSP `img-src`
   * allows. Default `PUBLIC_BASE_URL`, falling back to `http://localhost:3001`
   * exactly as the upload service does; `null` allows no uploads origin.
   */
  uploadsOrigin?: string | null;
  /**
   * Extra bare hostnames an `<img>` may load from over https (TASK-758). Default
   * the comma-separated `IMAGE_HOSTS`, which mirrors the storefront's
   * `NEXT_PUBLIC_IMAGE_HOSTS`; unset means none.
   */
  imageHosts?: readonly string[];
}

/** The options with defaults applied, normalised once per call. */
interface ResolvedSanitizeOptions {
  siteOrigin: string | undefined;
  uploadsOrigin: string | undefined;
  imageHosts: ReadonlySet<string>;
}

/**
 * Same default the upload service builds image URLs with when PUBLIC_BASE_URL
 * is unset (image-upload.service.ts), so a local upload survives a local save.
 */
const DEFAULT_UPLOADS_ORIGIN = 'http://localhost:3001';

/**
 * A bare hostname — the storefront CSP's own test for an image host
 * (content-security-policy.ts `HOSTNAME_RE`). Anything else is skipped there,
 * so it is skipped here too: a host the CSP never emits must not be allowed.
 */
const HOSTNAME_RE = /^[a-z0-9.-]+$/;

function normalizeHosts(hosts: readonly string[]): ReadonlySet<string> {
  return new Set(
    hosts.map((host) => host.trim().toLowerCase()).filter((host) => HOSTNAME_RE.test(host)),
  );
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
    uploadsOrigin: httpOrigin(
      options?.uploadsOrigin !== undefined
        ? options.uploadsOrigin
        : (process.env.PUBLIC_BASE_URL ?? DEFAULT_UPLOADS_ORIGIN),
    ),
    imageHosts: normalizeHosts(options?.imageHosts ?? (process.env.IMAGE_HOSTS ?? '').split(',')),
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
 * The upper bound of each span attribute (TASK-548). A `<col>`/`<colgroup>`
 * `span` counts columns, so it shares the column bound.
 */
const SPAN_LIMITS: Readonly<Record<string, number>> = {
  colspan: MAX_TABLE_COLSPAN,
  rowspan: MAX_TABLE_ROWSPAN,
  span: MAX_TABLE_COLSPAN,
};

/**
 * HTML's "rules for parsing non-negative integers", which is how a browser
 * reads a span: leading ASCII whitespace and one `+` are skipped, the digits
 * that follow are the value, and anything after them is ignored — so `" +3px"`
 * is 3 to the browser, and must be 3 here too, or the clamp and the renderer
 * would disagree about the table.
 */
const HTML_NON_NEGATIVE_INTEGER = /^[\t\n\f\r ]*\+?(\d+)/;

/**
 * Keep every span attribute on a table element inside the documented range
 * ({@link MAX_TABLE_COLSPAN}, {@link MAX_TABLE_ROWSPAN}): read it the way a
 * browser does, clamp a value above the bound to the bound, drop one below 1
 * (zero — `rowspan="0"` is "to the end of the section", an unbounded span by
 * another name — or unparseable) so the browser default of 1 applies, and
 * write what is kept back as plain digits. Other attributes pass through to the
 * allow-list untouched.
 */
function clampSpans(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const next: sanitizeHtml.Attributes = { ...attribs };
  for (const [name, max] of Object.entries(SPAN_LIMITS)) {
    const raw = next[name];
    if (raw === undefined) {
      continue;
    }
    const digits = HTML_NON_NEGATIVE_INTEGER.exec(raw)?.[1];
    const value = digits === undefined ? 0 : Number(digits);
    if (value < 1) {
      delete next[name];
    } else {
      next[name] = String(Math.min(value, max));
    }
  }
  return { tagName, attribs: next };
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
      th: clampSpans,
      td: clampSpans,
      col: clampSpans,
      colgroup: clampSpans,
    },
    // An `<img>` whose source did not pass {@link isAllowedImageSrc} is dropped
    // WHOLE. Leaving it with the src stripped would store a sourceless image —
    // an empty box on the page, and no content anyone can edit back.
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !isAllowedImageSrc(frame.attribs.src, options),
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
 *
 * The allow-list is the storefront CSP `img-src`, seen from the API (TASK-758):
 * a relative path (`'self'`), the API's own origin (uploads), an operator host
 * from IMAGE_HOSTS over plain https on the default port (the CSP emits exactly
 * `https://<host>`), or a raster `data:` image. Any other host — a vendor's
 * hot-linked picture from the catalogue import above all — is an image the
 * storefront would refuse to load, so it is not stored in the first place.
 *
 * `data:` is the one place the CSP is no backstop: its `img-src` allows every
 * `data:` URI, SVG included. The raster-only rule is held here and, for bodies
 * stored before it, by the storefront's DOMPurify pass (`sanitize-html.ts`).
 *
 * The URL is parsed the way a browser does (WHATWG URL, against a placeholder
 * base), so a protocol-relative `//host`, a backslash `\\host` and a
 * `https://allowed@evil` userinfo trick all resolve to the host they really hit.
 */
function isAllowedImageSrc(src: string | undefined, options: ResolvedSanitizeOptions): boolean {
  if (!src) {
    return false;
  }
  const normalized = src.replace(URL_INVISIBLES, '');
  if (/^data:/i.test(normalized)) {
    return DATA_IMAGE_SRC.test(normalized);
  }
  let url: URL;
  try {
    url = new URL(normalized, RELATIVE_BASE);
  } catch {
    return false;
  }
  if (url.origin === RELATIVE_ORIGIN) {
    return true;
  }
  if (options.uploadsOrigin !== undefined && url.origin === options.uploadsOrigin) {
    return true;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    options.imageHosts.has(url.hostname)
  );
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
