/**
 * A `.tsx` on purpose: it runs in the jsdom `component` project. The real
 * `isomorphic-dompurify` builds its own bundled jsdom on import, which cannot
 * initialise under Jest (see `app/legal/[slug]/page.test.ts`), so it is swapped
 * for plain `dompurify` bound to the test's own jsdom window — the same library
 * `isomorphic-dompurify` wraps, running the same hooks and the same config.
 */
jest.mock("isomorphic-dompurify", () => {
  const createDOMPurify = jest.requireActual("dompurify");
  const factory = createDOMPurify.default ?? createDOMPurify;
  return { __esModule: true, default: factory(window) };
});

import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml — tables (TASK-548)", () => {
  it("keeps caption, colgroup, col and tfoot", () => {
    const out = sanitizeHtml(
      "<table><caption>Розміри</caption>" +
        '<colgroup><col span="2"></colgroup>' +
        "<tbody><tr><td>1</td><td>2</td></tr></tbody>" +
        "<tfoot><tr><td>Σ</td><td>3</td></tr></tfoot></table>",
    );

    expect(out).toContain("<caption>Розміри</caption>");
    expect(out).toContain('<colgroup><col span="2"></colgroup>');
    expect(out).toContain("<tfoot><tr><td>Σ</td><td>3</td></tr></tfoot>");
  });

  it("clamps an oversized span a stored body may still carry", () => {
    const out = sanitizeHtml(
      '<table><colgroup span="1000"><col span="9999"></colgroup><tbody><tr>' +
        '<th colspan="9999">H</th><td rowspan="70000">D</td><td rowspan="0">Z</td>' +
        "</tr></tbody></table>",
    );

    expect(out).toContain('<colgroup span="20"><col span="20"></colgroup>');
    expect(out).toContain('<th colspan="20">H</th>');
    expect(out).toContain('<td rowspan="100">D</td>');
    expect(out).toContain("<td>Z</td>");
  });

  it("leaves an in-range span as written", () => {
    expect(
      sanitizeHtml(
        '<table><tbody><tr><td colspan="2" rowspan="3">x</td></tr></tbody></table>',
      ),
    ).toContain('<td colspan="2" rowspan="3">x</td>');
  });
});
