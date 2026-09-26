import { test, expect } from "./fixtures/test";
import { API_PORT } from "./fixtures/ports";
import { E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * The storefront really SENDS its Content-Security-Policy (TASK-760).
 *
 * `content-security-policy.test.ts` pins the pure builder, but nothing checked
 * that `next.config.ts` `headers()` attaches its output to responses: a
 * refactor that narrowed the `source` pattern, dropped the header from the
 * array or broke the host filter feeding `img-src` would leave every unit suite
 * green. This asks the running server, on several kinds of route.
 *
 * The harness runs `next dev`, whose policy also carries `'unsafe-eval'` (React
 * dev stacks) — so this does not assert its absence; SF-UX-17 checks that on a
 * production build.
 */
const API_ORIGIN = `http://localhost:${API_PORT}`;

/** Routes of each rendering kind the header must be on. */
const ROUTES = [
  "/",
  "/products",
  `/products/${E2E_PRODUCT_SLUG}`,
  "/blog",
  "/robots.txt",
];

/** `img-src 'self' data: …` → { "img-src": ["'self'", "data:", …] }. */
function parsePolicy(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of header.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name, values);
  }
  return directives;
}

test.describe("storefront Content-Security-Policy header", () => {
  for (const route of ROUTES) {
    test(`is sent on ${route}`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status(), route).toBeLessThan(400);

      const header = response.headers()["content-security-policy"];
      expect(header, `no CSP header on ${route}`).toBeTruthy();

      const policy = parsePolicy(header!);
      expect(policy.get("default-src")).toEqual(["'self'"]);
      // The API origin is where uploaded pictures (logo, blog covers, rich
      // text) load from as raw <img>; without it every one of them is blocked.
      expect(policy.get("img-src")).toEqual(
        expect.arrayContaining(["'self'", "data:", API_ORIGIN]),
      );
      expect(policy.get("connect-src")).toEqual(
        expect.arrayContaining(["'self'", API_ORIGIN]),
      );
      expect(policy.get("frame-ancestors")).toEqual(["'self'"]);
      expect(policy.get("object-src")).toEqual(["'none'"]);
      expect(policy.get("form-action")).toEqual(
        expect.arrayContaining(["'self'", "https://www.liqpay.ua"]),
      );

      expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    });
  }

  test("is the policy the browser actually enforces on a page load", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const header = response?.headers()["content-security-policy"];

    expect(header).toBeTruthy();
    expect(parsePolicy(header!).get("img-src")).toContain(API_ORIGIN);
  });
});
