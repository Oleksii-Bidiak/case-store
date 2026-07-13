import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list policy for uploaded SVG logos.
 *
 * An SVG served from the API's own origin is executable content: it can carry
 * `<script>`, `on*` handlers, `<foreignObject>` with embedded HTML, `javascript:`
 * hrefs and external references. This module reduces an untrusted upload to inert
 * vector graphics before it is ever written to disk. It is deliberately separate
 * from {@link sanitizeRichText} — that policy is an HTML allow-list and shares no
 * element with this one.
 *
 * Structural notes that are NOT obvious:
 *
 *  - SVG is XML and therefore case-sensitive (`viewBox`, `linearGradient`), while
 *    sanitize-html parses in HTML mode and lower-cases by default. We keep the
 *    parser case-preserving and re-canonicalise every name ourselves, so real SVG
 *    casing survives while `<SCRIPT>` / `OnLoAd=` fold onto the lower-case names
 *    the allow-list rejects.
 *  - The HTML-mode parser can emit a stray closing tag for badly-nested hostile
 *    markup, which would make the file invalid XML. Everything is therefore
 *    re-validated structurally after sanitising (see {@link isRenderableSvg}).
 */

/** Elements a store logo may legitimately use. `image`, `style`, `a`, `filter` are absent on purpose. */
const ALLOWED_TAGS = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'use',
  'linearGradient',
  'radialGradient',
  'stop',
  'title',
  'desc',
  'clipPath',
  'mask',
  'text',
  'tspan',
];

/**
 * Attributes allowed on any allow-listed element: geometry, paint and text
 * presentation only. `style` is absent because CSS can smuggle `@import` and
 * `url(javascript:…)`; `filter` and `image`-style external references are absent
 * because they can pull in remote content.
 */
const ALLOWED_ATTRS = [
  'id',
  'd',
  'points',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'dx',
  'dy',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'stroke-miterlimit',
  'opacity',
  'color',
  'transform',
  'transform-origin',
  'clip-path',
  'clip-rule',
  'mask',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'letter-spacing',
  'dominant-baseline',
  'viewBox',
  'xmlns',
  'xmlns:xlink',
  'version',
  'preserveAspectRatio',
  'role',
  'aria-hidden',
  'aria-label',
  'href',
  'xlink:href',
];

/** Tags whose CONTENTS are dropped too, so a stripped `<script>` leaves no payload text behind. */
const NON_TEXT_TAGS = [
  'script',
  'style',
  'foreignobject',
  'iframe',
  'noscript',
  'textarea',
  'animate',
  'animatetransform',
  'set',
  'handler',
  'annotation-xml',
];

/** Lower-cased name → canonical (camelCase) SVG name. */
const CANONICAL_TAG: Record<string, string> = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
};

const CANONICAL_ATTR: Record<string, string> = {
  viewbox: 'viewBox',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  spreadmethod: 'spreadMethod',
  clippathunits: 'clipPathUnits',
  maskunits: 'maskUnits',
  maskcontentunits: 'maskContentUnits',
  preserveaspectratio: 'preserveAspectRatio',
};

/** Attributes only meaningful on the root `<svg>`; dropped anywhere else. */
const ROOT_ONLY_ATTRS = new Set([
  'xmlns',
  'xmlns:xlink',
  'version',
  'viewBox',
  'preserveAspectRatio',
]);

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** `href` / `xlink:href` may only ever point at a fragment inside this same document. */
const FRAGMENT_REF = /^#[A-Za-z_][\w.:-]*$/;

/** Any scheme that can execute or inline content. Entities are already decoded by the parser. */
const EXECUTABLE_SCHEME = /(javascript|vbscript|data)\s*:/i;

/** `fill="url(#gradient)"` is fine; `url(http://evil/…)` pulls in a remote resource. */
const URL_REF = /url\(/i;
const LOCAL_URL_REF = /^url\(\s*['"]?#[A-Za-z_][\w.:-]*['"]?\s*\)$/i;

/**
 * Last-line residue check on the sanitized markup. The allow-list above already
 * makes these unreachable — this exists so a future widening of the policy fails
 * closed (400) instead of silently shipping an XSS.
 */
const DANGEROUS_RESIDUE =
  /<\s*\/?\s*(script|foreignobject|iframe)|javascript\s*:|vbscript\s*:|\son[a-z]+\s*=/i;

const TAG_TOKEN = /<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g;

const SVG_POLICY: sanitizeHtml.IOptions = {
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false, recognizeSelfClosing: true },
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { '*': ALLOWED_ATTRS },
  allowedSchemes: [],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  nonTextTags: NON_TEXT_TAGS,
  transformTags: {
    // Runs before the allow-list check, on every element, so it is the single
    // place that normalises case and scrubs attribute values.
    '*': (tagName, attribs) => {
      const lowerTag = tagName.toLowerCase();
      const tag = CANONICAL_TAG[lowerTag] ?? lowerTag;
      const isRoot = tag === 'svg';
      const safe: Record<string, string> = {};

      for (const [rawName, rawValue] of Object.entries(attribs ?? {})) {
        const lowerName = rawName.toLowerCase();
        if (lowerName.startsWith('on')) {
          continue;
        }

        const name = CANONICAL_ATTR[lowerName] ?? lowerName;
        if (!isRoot && ROOT_ONLY_ATTRS.has(name)) {
          continue;
        }

        // An empty value would be emitted as a bare attribute name, which is not
        // well-formed XML — and an empty paint/geometry attribute means nothing.
        const value = String(rawValue ?? '').trim();
        if (value === '') {
          continue;
        }
        if (EXECUTABLE_SCHEME.test(value)) {
          continue;
        }
        if (URL_REF.test(value) && !LOCAL_URL_REF.test(value)) {
          continue;
        }
        if ((lowerName === 'href' || lowerName === 'xlink:href') && !FRAGMENT_REF.test(value)) {
          continue;
        }

        safe[name] = value;
      }

      if (isRoot) {
        safe.xmlns = SVG_NS;
        if (safe['xmlns:xlink'] !== undefined) {
          safe['xmlns:xlink'] = XLINK_NS;
        }
      }

      return { tagName: tag, attribs: safe };
    },
  },
};

/**
 * Verify the sanitized markup is a single, well-formed, non-empty SVG document.
 *
 * Needed because sanitize-html's HTML-mode parser can leave a stray closing tag
 * behind (e.g. `</foreignobject>`) when hostile markup is badly nested; such a
 * file is invalid XML and a browser would refuse to render it. Scanning the
 * OUTPUT is safe with a regex: every attribute value and text node has already
 * been entity-escaped, so no `<` or `>` can appear outside a real tag.
 */
function isRenderableSvg(markup: string): boolean {
  if (!markup.startsWith('<svg') || !markup.endsWith('</svg>')) {
    return false;
  }

  const allowed = new Set(ALLOWED_TAGS);
  let depth = 0;
  let elements = 0;
  let rootClosed = false;

  TAG_TOKEN.lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = TAG_TOKEN.exec(markup)) !== null) {
    const [, closing, name, selfClosing] = token;
    if (!allowed.has(name)) {
      return false;
    }
    if (selfClosing) {
      elements++;
      continue;
    }
    if (closing) {
      depth--;
      if (depth < 0) {
        return false;
      }
      if (depth === 0) {
        // A second root element would make the document invalid XML.
        if (rootClosed || TAG_TOKEN.lastIndex !== markup.length) {
          return false;
        }
        rootClosed = true;
      }
      continue;
    }
    depth++;
    elements++;
  }

  // > 1 element: the root plus at least one thing to actually draw.
  return depth === 0 && rootClosed && elements > 1;
}

/**
 * Sanitize an untrusted SVG upload down to inert vector graphics.
 *
 * Pure and side-effect free. Returns the sanitized markup, or `null` when the
 * input is not an SVG at all, carries an entity declaration (XXE / billion
 * laughs), or has nothing renderable and safe left after sanitising — callers
 * map `null` onto a 400.
 */
export function sanitizeSvg(raw: string): string | null {
  if (!raw) {
    return null;
  }
  // An entity declaration in an uploaded logo is only ever an XXE / expansion
  // attack; the parser drops the DTD but would leave its `]>` tail as stray text.
  if (/<!ENTITY/i.test(raw)) {
    return null;
  }
  if (!/<svg[\s>]/i.test(raw)) {
    return null;
  }

  const clean = sanitizeHtml(raw, SVG_POLICY).trim();

  if (!isRenderableSvg(clean) || DANGEROUS_RESIDUE.test(clean)) {
    return null;
  }

  return clean;
}
