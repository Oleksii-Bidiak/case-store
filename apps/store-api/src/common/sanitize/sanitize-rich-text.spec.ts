import { MAX_TABLE_COLSPAN, MAX_TABLE_ROWSPAN } from './rich-text.constants';
import { sanitizeRichText } from './sanitize-rich-text';

/**
 * The environment variables the sanitizer reads its defaults from. Every test
 * starts with all of them unset, so a developer's local env file cannot change
 * what the suite sees; a test that needs one sets it explicitly.
 */
const SANITIZER_ENV_KEYS = ['STORE_CLIENT_URL', 'PUBLIC_BASE_URL', 'IMAGE_HOSTS'] as const;
const savedEnv: Partial<Record<(typeof SANITIZER_ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of SANITIZER_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SANITIZER_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe('sanitizeRichText', () => {
  it('strips <script> tags and their contents', () => {
    const result = sanitizeRichText('<p>Hello</p><script>alert(1)</script>');

    expect(result).toContain('<p>Hello</p>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(1)');
  });

  it('strips inline event handlers (onerror, onclick, …)', () => {
    const result = sanitizeRichText('<img src="/uploads/y.png" onerror="alert(1)" alt="x" />');

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('src="/uploads/y.png"');
  });

  /**
   * TASK-758 — an `<img>` used to survive with ANY http(s) source, so supplier
   * HTML from the catalogue import kept pictures hot-linked from vendor hosts.
   * The storefront CSP `img-src` refuses those hosts, so on the page they are
   * broken images at best, and `upgrade-insecure-requests` kills every http one.
   * The allow-list here is the CSP's, from the API side: relative paths ('self'),
   * the API's own uploads origin (the CSP's API origin) and the operator's extra
   * hosts (NEXT_PUBLIC_IMAGE_HOSTS on the storefront, IMAGE_HOSTS here, https
   * only — the CSP emits `https://<host>`), plus the raster data: URIs above.
   */
  describe('image sources (TASK-758)', () => {
    const API = 'https://api.shop.example.com';
    const CDN = 'cdn.shop.example.com';
    const opts = { uploadsOrigin: API, imageHosts: [CDN] };
    const img = (src: string): string => `<img src="${src}" alt="a" />`;
    const kept = (src: string, options: Parameters<typeof sanitizeRichText>[1] = opts): void => {
      expect(sanitizeRichText(img(src), options)).toBe(img(src));
    };
    const stripped = (
      src: string,
      options: Parameters<typeof sanitizeRichText>[1] = opts,
    ): void => {
      expect(sanitizeRichText(`<p>a</p>${img(src)}<p>b</p>`, options)).toBe('<p>a</p><p>b</p>');
    };

    it('keeps a root-relative source', () => kept('/uploads/products/a.png'));
    it('keeps a path-relative source', () => kept('uploads/products/a.png'));
    it('keeps the API uploads origin', () => kept(`${API}/uploads/products/a.png`));
    it('keeps an allow-listed https host', () => kept(`https://${CDN}/a.png`));
    it('matches the allow-listed host case-insensitively', () =>
      kept('https://CDN.Shop.Example.com/a.png'));

    it('strips a vendor host', () => stripped('https://vendor.example.net/a.jpg'));
    it('strips an http vendor host', () => stripped('http://vendor.example.net/a.jpg'));
    it('strips an allow-listed host over http — the CSP only emits https', () =>
      stripped(`http://${CDN}/a.png`));
    it('strips an allow-listed host on another port', () => stripped(`https://${CDN}:8443/a.png`));
    it('strips a subdomain of an allow-listed host', () => stripped(`https://evil.${CDN}/a.png`));
    it('strips a host that merely starts with an allow-listed one', () =>
      stripped(`https://${CDN}.evil.net/a.png`));
    it('strips an allow-listed host smuggled as userinfo', () =>
      stripped(`https://${CDN}@evil.net/a.png`));
    it('strips a protocol-relative source', () => stripped('//vendor.example.net/a.jpg'));
    it('strips a backslash source a browser reads as protocol-relative', () =>
      stripped('\\\\vendor.example.net\\a.jpg'));
    it('strips the uploads host on another scheme', () =>
      stripped('http://api.shop.example.com/uploads/a.png'));

    it('reads the uploads origin from PUBLIC_BASE_URL by default', () => {
      process.env.PUBLIC_BASE_URL = API;

      kept(`${API}/uploads/a.png`, {});
      stripped('http://localhost:3001/uploads/a.png', {});
    });

    it('falls back to the uploads default the upload service uses when PUBLIC_BASE_URL is unset', () => {
      kept('http://localhost:3001/uploads/a.png', {});
    });

    it('reads extra hosts from IMAGE_HOSTS by default, trimmed and case-insensitive', () => {
      process.env.IMAGE_HOSTS = ' CDN.shop.example.com , images.brand.com ,';

      kept(`https://${CDN}/a.png`, {});
      kept('https://images.brand.com/a.png', {});
      stripped('https://vendor.example.net/a.jpg', {});
    });

    it('allows no extra host when IMAGE_HOSTS is unset', () => {
      stripped(`https://${CDN}/a.png`, {});
    });

    it('skips an IMAGE_HOSTS entry the storefront CSP would skip (not a bare hostname)', () => {
      process.env.IMAGE_HOSTS = `https://${CDN}`;

      stripped(`https://${CDN}/a.png`, {});
    });

    // Every write path and the seed call it with ONE argument: that call must
    // read the same deployment values as `{}` does.
    it('applies the environment allow-list to the one-argument call', () => {
      process.env.PUBLIC_BASE_URL = API;
      process.env.IMAGE_HOSTS = CDN;

      expect(sanitizeRichText(img(`${API}/uploads/a.png`))).toBe(img(`${API}/uploads/a.png`));
      expect(sanitizeRichText(img(`https://${CDN}/a.png`))).toBe(img(`https://${CDN}/a.png`));
      expect(sanitizeRichText(`<p>a</p>${img('https://vendor.example.net/a.jpg')}`)).toBe(
        '<p>a</p>',
      );
    });
  });

  it('strips javascript: URLs from links', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">click</a>');

    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert(1)');
  });

  it('preserves allowed formatting tags', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> <em>italic</em></p>' +
      '<ul><li>one</li></ul><blockquote>quote</blockquote><pre><code>x</code></pre>';

    const result = sanitizeRichText(html);

    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<ul><li>one</li></ul>');
    expect(result).toContain('<blockquote>quote</blockquote>');
    expect(result).toContain('<pre><code>x</code></pre>');
  });

  it('preserves allowed table markup', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>';

    expect(sanitizeRichText(html)).toBe(html);
  });

  /**
   * TASK-434 — the admin editor can now build tables, and prosemirror-tables
   * expresses a merged cell as `colspan`/`rowspan` on the surviving `th`/`td`.
   * Until this test existed, the policy allowed no attributes on cells at all,
   * so a merged header came back from the first save as separate cells: a
   * silent, irreversible structural edit nobody asked for.
   */
  it('keeps colspan/rowspan so merged cells survive a save', () => {
    const html =
      '<table><tbody>' +
      '<tr><th colspan="2">Параметри</th></tr>' +
      '<tr><td rowspan="2">Вага</td><td>120 г</td></tr>' +
      '<tr><td>130 г</td></tr>' +
      '</tbody></table>';

    expect(sanitizeRichText(html)).toBe(html);
  });

  /**
   * TASK-548 — the rest of a real table. The catalogue import writes vendor
   * HTML through this sanitizer, and a spec table with a caption, a column
   * group or a totals footer lost those parts on its very first save.
   */
  it('keeps caption, colgroup, col and tfoot', () => {
    const html =
      '<table><caption>Розміри</caption>' +
      '<colgroup><col span="2" /><col /></colgroup>' +
      '<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody>' +
      '<tfoot><tr><td colspan="2">Разом</td><td>3</td></tr></tfoot>' +
      '</table>';

    expect(sanitizeRichText(html)).toBe(html);
  });

  it('keeps inline formatting inside a caption but no attributes on it', () => {
    const result = sanitizeRichText(
      '<table><caption class="x" style="color:red" onclick="alert(1)">Розміри <strong>чохлів</strong></caption>' +
        '<tbody><tr><td>1</td></tr></tbody></table>',
    );

    expect(result).toContain('<caption>Розміри <strong>чохлів</strong></caption>');
  });

  it('strips every attribute but span from col and colgroup', () => {
    const result = sanitizeRichText(
      '<table><colgroup span="2" style="width:9999px" class="x"><col width="300" style="background:red" span="2" /></colgroup>' +
        '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );

    expect(result).toContain('<colgroup span="2"><col span="2" /></colgroup>');
  });

  /**
   * TASK-548 — a span is structure, but an unbounded one is a layout weapon:
   * `colspan="9999"` makes the browser lay out ten thousand columns in a
   * `table-fixed` table, squeezing every real one to nothing. Clamped, not
   * dropped, so an oversized merge still reads as a merge.
   */
  describe('clamps table spans to the documented range', () => {
    const cell = (attrs: string) => `<table><tbody><tr><td ${attrs}>x</td></tr></tbody></table>`;
    const cellOut = (attrs: string) => sanitizeRichText(cell(attrs)).match(/<td[^>]*>/)?.[0];

    it('exports the documented bounds', () => {
      expect(MAX_TABLE_COLSPAN).toBe(20);
      expect(MAX_TABLE_ROWSPAN).toBe(100);
    });

    it('caps colspan at MAX_TABLE_COLSPAN', () => {
      expect(cellOut('colspan="9999"')).toBe(`<td colspan="${MAX_TABLE_COLSPAN}">`);
    });

    it('caps rowspan at MAX_TABLE_ROWSPAN', () => {
      expect(cellOut('rowspan="70000"')).toBe(`<td rowspan="${MAX_TABLE_ROWSPAN}">`);
    });

    it('keeps an in-range span exactly as written, the boundaries included', () => {
      expect(cellOut('colspan="1" rowspan="1"')).toBe('<td colspan="1" rowspan="1">');
      expect(cellOut(`colspan="${MAX_TABLE_COLSPAN}"`)).toBe(`<td colspan="${MAX_TABLE_COLSPAN}">`);
      expect(cellOut(`rowspan="${MAX_TABLE_ROWSPAN}"`)).toBe(`<td rowspan="${MAX_TABLE_ROWSPAN}">`);
    });

    it('reads a span the way a browser does and writes it back normalised', () => {
      // HTML's "rules for parsing non-negative integers": leading whitespace
      // and a `+` are skipped, digits are read, trailing junk is ignored.
      expect(cellOut('colspan=" +3px"')).toBe('<td colspan="3">');
      expect(cellOut('rowspan="007"')).toBe('<td rowspan="7">');
    });

    it('drops a span that is zero, negative or not a number — the browser default is 1', () => {
      // `rowspan="0"` means "to the end of the section" in HTML — an unbounded
      // span by another name, so it goes the same way as garbage.
      expect(cellOut('colspan="0"')).toBe('<td>');
      expect(cellOut('rowspan="0"')).toBe('<td>');
      expect(cellOut('colspan="-4"')).toBe('<td>');
      expect(cellOut('rowspan="abc"')).toBe('<td>');
      expect(cellOut('colspan=""')).toBe('<td>');
    });

    it('clamps th exactly like td', () => {
      expect(
        sanitizeRichText(
          '<table><tbody><tr><th colspan="500" rowspan="500">H</th></tr></tbody></table>',
        ),
      ).toContain(`<th colspan="${MAX_TABLE_COLSPAN}" rowspan="${MAX_TABLE_ROWSPAN}">`);
    });

    it('clamps col and colgroup span against the column bound', () => {
      const result = sanitizeRichText(
        '<table><colgroup span="1000"><col span="9999" /><col span="0" /></colgroup>' +
          '<tbody><tr><td>1</td></tr></tbody></table>',
      );

      expect(result).toContain(
        `<colgroup span="${MAX_TABLE_COLSPAN}"><col span="${MAX_TABLE_COLSPAN}" /><col /></colgroup>`,
      );
    });
  });

  it('strips every other attribute from table cells', () => {
    const result = sanitizeRichText(
      '<table><tbody><tr>' +
        '<td style="color:red" onclick="alert(1)" class="x" width="300" colspan="2">D</td>' +
        '</tr></tbody></table>',
    );

    expect(result).toContain('colspan="2"');
    expect(result).not.toContain('style');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('class');
    expect(result).not.toContain('width');
    expect(result).toContain('>D</td>');
  });

  it('forces rel="noopener noreferrer nofollow" on an external link', () => {
    const result = sanitizeRichText('<a href="https://example.com" target="_blank">link</a>');

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  /**
   * TASK-575 — `nofollow` used to land on EVERY link, internal ones included.
   * An internal `nofollow` does not redistribute link equity, it throws it away,
   * so each cross-link the CMS now lets an operator make worked against SEO.
   * `noopener noreferrer` stays on everything; `nofollow` only where the link
   * leaves the store.
   */
  describe('rel by link destination (TASK-575)', () => {
    const SHOP = 'https://shop.example.com';
    const relOf = (html: string, options?: Parameters<typeof sanitizeRichText>[1]): string =>
      /rel="([^"]*)"/.exec(sanitizeRichText(html, options))?.[1] ?? '<no rel>';

    it('gives a relative path no nofollow', () => {
      expect(relOf('<a href="/catalog/cases">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
    });

    it('gives a bare relative path no nofollow', () => {
      expect(relOf('<a href="catalog/cases">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
    });

    it('gives an in-page anchor no nofollow', () => {
      expect(relOf('<a href="#delivery">x</a>', { siteOrigin: SHOP })).toBe('noopener noreferrer');
    });

    it('gives an absolute link to the store itself no nofollow', () => {
      expect(relOf(`<a href="${SHOP}/blog/post">x</a>`, { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
    });

    it('compares origins case-insensitively, as a browser does', () => {
      expect(relOf('<a href="HTTPS://SHOP.EXAMPLE.COM/x">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
    });

    it('gives a link to another origin nofollow', () => {
      expect(relOf('<a href="https://other.example.com/x">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer nofollow',
      );
    });

    it('treats another subdomain of the same site as another origin', () => {
      expect(relOf('<a href="https://api.shop.example.com/x">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer nofollow',
      );
    });

    it('treats the same host on another scheme as another origin', () => {
      expect(relOf('<a href="http://shop.example.com/x">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer nofollow',
      );
    });

    it('treats every absolute link as external when the store origin is unknown', () => {
      expect(relOf(`<a href="${SHOP}/x">x</a>`, { siteOrigin: null })).toBe(
        'noopener noreferrer nofollow',
      );
      expect(relOf('<a href="/x">x</a>', { siteOrigin: null })).toBe('noopener noreferrer');
    });

    it('gives mailto: no nofollow — it is not a page', () => {
      expect(relOf('<a href="mailto:shop@example.com">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
    });

    it('replaces whatever rel the markup carried', () => {
      expect(relOf('<a href="/x" rel="nofollow ugc">x</a>', { siteOrigin: SHOP })).toBe(
        'noopener noreferrer',
      );
      expect(
        relOf('<a href="https://other.example.com" rel="follow">x</a>', { siteOrigin: SHOP }),
      ).toBe('noopener noreferrer nofollow');
    });

    it('reads the store origin from STORE_CLIENT_URL by default (one-argument call)', () => {
      process.env.STORE_CLIENT_URL = SHOP;

      expect(relOf(`<a href="${SHOP}/x">x</a>`)).toBe('noopener noreferrer');
      expect(relOf('<a href="https://other.example.com/x">x</a>')).toBe(
        'noopener noreferrer nofollow',
      );
    });

    it('treats absolute links as external when STORE_CLIENT_URL is unset', () => {
      expect(relOf(`<a href="${SHOP}/x">x</a>`)).toBe('noopener noreferrer nofollow');
    });
  });

  it('keeps http/https/mailto link schemes', () => {
    expect(sanitizeRichText('<a href="https://a.co">a</a>')).toContain('href="https://a.co"');
    expect(sanitizeRichText('<a href="mailto:x@a.co">a</a>')).toContain('href="mailto:x@a.co"');
  });

  /**
   * TASK-571 — `allowedSchemesByTag.img` used to admit ANY `data:` URI, so
   * `data:text/html` and `data:image/svg+xml` reached the database verbatim.
   * Only a base64 raster image survives now; everything else loses the whole
   * `<img>` (an image with no source is not content).
   */
  describe('data: URIs on images (TASK-571)', () => {
    for (const mime of ['png', 'jpeg', 'jpg', 'gif', 'webp', 'avif']) {
      it(`keeps data:image/${mime};base64`, () => {
        const html = `<img src="data:image/${mime};base64,iVBORw0KGgo=" alt="a" />`;

        expect(sanitizeRichText(html)).toBe(html);
      });
    }

    it('accepts the mime type in any case', () => {
      expect(sanitizeRichText('<img src="data:IMAGE/PNG;base64,AAAA" />')).toContain(
        'data:IMAGE/PNG;base64,AAAA',
      );
    });

    it('strips data:text/html', () => {
      const result = sanitizeRichText(
        '<p>x</p><img src="data:text/html,<script>alert(1)</script>" />',
      );

      expect(result).toBe('<p>x</p>');
    });

    it('strips data:image/svg+xml, base64 or not', () => {
      expect(sanitizeRichText('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="a" />')).toBe('');
      expect(sanitizeRichText('<img src="data:image/svg+xml,<svg></svg>" />')).toBe('');
    });

    it('strips a raster data: URI that is not base64', () => {
      expect(sanitizeRichText('<img src="data:image/png,rawbytes" />')).toBe('');
    });

    it('strips a data: URI whose payload is not base64', () => {
      expect(sanitizeRichText('<img src="data:image/png;base64,<b>x</b>" />')).toBe('');
    });

    it('sees through whitespace a browser would drop from the scheme', () => {
      expect(sanitizeRichText('<img src="da\nta:text/html,x" />')).toBe('');
    });

    it('never allows data: on links', () => {
      const link = sanitizeRichText('<a href="data:text/html,<b>x</b>">a</a>');

      expect(link).not.toContain('data:');
    });
  });

  it('strips <style> and <iframe> entirely', () => {
    const result = sanitizeRichText(
      '<style>body{display:none}</style><iframe src="https://evil"></iframe><p>ok</p>',
    );

    expect(result).not.toContain('style');
    expect(result).not.toContain('iframe');
    expect(result).toContain('<p>ok</p>');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichText('')).toBe('');
  });

  /**
   * GHSA-jxwj-j7wr-gfrw (sanitize-html < 2.17.6) — TASK-350.
   *
   * `textarea` and `xmp` are RAW-TEXT elements: a parser that is not
   * namespace-aware tokenises their contents as opaque text even inside
   * SVG/MathML foreign content, where a browser re-parses them as live markup.
   * On 2.17.5 the sanitizer then re-emitted that text VERBATIM, so
   * `<svg><textarea><img src=x onerror=…>` survived intact. The same parser also
   * failed to treat `</textarea/>` (trailing solidus) as a closing tag.
   *
   * We were never exploitable — the bypass needs `textarea`/`xmp` in
   * `allowedTags`, and this policy allows neither — but that made our safety a
   * property of the allow-list rather than of the library, invisible to the
   * suite: every one of the tests above passes identically on 2.17.5 and 2.17.6.
   * These cases assert the property directly, so widening `allowedTags` or
   * moving the parser back cannot quietly reopen it.
   */
  describe('raw-text element bypass (GHSA-jxwj-j7wr-gfrw)', () => {
    /** A real tag carrying an inline handler is what "escaped the allow-list" looks like. */
    const HANDLER_IN_TAG = /<[^>]*\son[a-z]+\s*=/i;
    const PAYLOAD = '<img src=x onerror=alert(1)>';

    const wrappers: Array<[string, (inner: string) => string]> = [
      ['bare', (inner) => inner],
      ['in <svg> foreign content', (inner) => `<svg>${inner}</svg>`],
      ['in <math> foreign content', (inner) => `<math>${inner}</math>`],
      ['in <svg><foreignObject>', (inner) => `<svg><foreignObject>${inner}</foreignObject></svg>`],
      ['inside an allowed <p>', (inner) => `<p>${inner}</p>`],
    ];

    for (const tag of ['textarea', 'xmp', 'title', 'noembed', 'noframes', 'iframe', 'plaintext']) {
      for (const [where, wrap] of wrappers) {
        it(`never emits a live handler for <${tag}> ${where}`, () => {
          expect(sanitizeRichText(wrap(`<${tag}>${PAYLOAD}</${tag}>`))).not.toMatch(HANDLER_IN_TAG);
        });

        it(`never emits a live handler for <${tag}> mis-closed with a solidus ${where}`, () => {
          expect(sanitizeRichText(wrap(`<${tag}></${tag}/>${PAYLOAD}</${tag}>`))).not.toMatch(
            HANDLER_IN_TAG,
          );
        });
      }
    }

    it('escapes entity-encoded markup smuggled through <option>', () => {
      const result = sanitizeRichText('<option>&lt;script&gt;alert(1)&lt;/script&gt;</option>');

      expect(result).not.toMatch(/<\s*script/i);
      expect(result).toContain('&lt;script&gt;');
    });
  });
});
