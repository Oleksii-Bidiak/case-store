/**
 * The storefront's Content-Security-Policy, as a pure function (TASK-452).
 *
 * Called from `next.config.ts` `headers()`, which runs at BUILD time: every input
 * here is a `NEXT_PUBLIC_*` value already baked into the bundle, so the policy
 * and the code it governs can never disagree about which hosts exist. Kept free
 * of imports so the config loader can pull it in without dragging the app along.
 *
 * ── Why `'unsafe-inline'` and no nonce (decision 2026-09-19) ─────────────────────
 * Next injects inline `<script>` (the RSC payload, `self.__next_f.push(...)`) and
 * inline `<style>` (next/font, the next-themes flash guard) into every page. A
 * nonce is the only way to allow those without `'unsafe-inline'`, and a nonce
 * exists only per REQUEST: Next applies it during server rendering, so every page
 * would have to render dynamically — no static generation, no ISR, for a
 * storefront whose catalogue, PDPs and blog are ISR precisely so a 2-vCPU box can
 * serve them. Experimental SRI (`experimental.sri`) hashes the external chunks
 * only; the inline RSC payload still needs `'unsafe-inline'`.
 *
 * So this policy does not stop an injected inline script — React's escaping and
 * the server-side rich-text sanitizer remain that defence. What it DOES stop is
 * everything around it: loading a script from a foreign origin, exfiltrating over
 * XHR/fetch to one (`connect-src`), plugins (`object-src`), `<base>` hijacking,
 * form posts to a foreign origin, and framing (`frame-ancestors`).
 * Revisit when Next can hash its own inline payload for static pages.
 */

/**
 * The LiqPay hosted-checkout origin — the one foreign place a storefront form
 * posts to (`features/checkout/lib/payment-handoff.ts`). A provider constant, not
 * a deployment setting: it mirrors `LIQPAY_CHECKOUT_URL` in store-api's
 * `payment/adapters/liqpay/liqpay.types.ts`, and the handoff URL the storefront
 * submits to comes from that constant via the API. If that constant ever
 * changes, this one must change with it — or `form-action` blocks every card
 * payment with nothing but a console line to show for it.
 */
export const LIQPAY_CHECKOUT_ORIGINS = [
  "https://www.liqpay.ua",
  // The apex too, deliberately. Chrome and Safari apply `form-action` to every
  // REDIRECT of the form navigation, not just its first target: a 302 from
  // `www.liqpay.ua` to `liqpay.ua` would cancel the navigation with nothing but
  // a console line, and the order would already exist server-side with a
  // pending payment. We have never run this path against the live provider
  // (SF-PAY-17 is still blocked on a LiqPay sandbox), so the narrow guess is
  // the expensive one — both hosts are the same provider either way.
  "https://liqpay.ua",
] as const;

export interface ContentSecurityPolicyInput {
  /** `NODE_ENV === "development"` — adds `'unsafe-eval'` for React's dev stacks. */
  isDev: boolean;
  /** `NEXT_PUBLIC_API_URL` — XHR target and the `/uploads` image origin. */
  apiUrl?: string;
  /**
   * Bare hostnames from `NEXT_PUBLIC_IMAGE_HOSTS` (https only). Validated HERE,
   * not by the caller: sources are joined with spaces, so one value containing
   * a space would splice a second, arbitrary source into `img-src` — and the
   * header is assembled in this file, which is also the part that has tests.
   */
  imageHosts?: readonly string[];
  /** `NEXT_PUBLIC_UMAMI_SRC` — tracker script URL; beacons go to the same origin. */
  umamiSrc?: string;
  /**
   * `NEXT_PUBLIC_SENTRY_DSN` — only its host is used (the ingest endpoint).
   *
   * No `worker-src` is emitted, which is correct only while Session Replay is
   * off: Replay's compression worker is a `blob:` URL, and `worker-src` falls
   * back through `child-src` to `script-src`, which carries no `blob:`. Adding
   * `replayIntegration()` therefore needs `worker-src 'self' blob:` here, or
   * replays silently never arrive.
   */
  sentryDsn?: string;
}

/**
 * A bare hostname: letters, digits, dots and dashes. No scheme, port, path,
 * wildcard — and, critically, no whitespace or CSP keyword.
 */
const HOSTNAME_RE = /^[a-z0-9.-]+$/;

/**
 * The `http(s)` origin of a URL, or undefined for anything unset, unparseable or
 * on another scheme. `URL.origin` drops the userinfo, which is what keeps a
 * Sentry DSN's public key out of the header.
 */
function httpOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the defined sources, first occurrence wins. */
function sources(...values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

/**
 * Build the policy as one header line. Unset or malformed inputs are skipped, so
 * a store without Umami or Sentry gets a policy without them rather than one
 * with `undefined` in it.
 */
export function buildContentSecurityPolicy(
  input: ContentSecurityPolicyInput,
): string {
  const api = httpOrigin(input.apiUrl);
  const umami = httpOrigin(input.umamiSrc);
  const sentry = httpOrigin(input.sentryDsn);
  const imageHosts = (input.imageHosts ?? [])
    .map((host) => host.trim().toLowerCase())
    .filter((host) => HOSTNAME_RE.test(host))
    .map((host) => `https://${host}`);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      sources(
        "'self'",
        "'unsafe-inline'",
        input.isDev ? "'unsafe-eval'" : undefined,
        umami,
      ),
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // next/image serves from our own `/_next/image`; a raw `<img>` (the logo,
    // blog covers, rich-text images) loads straight from the API or a CDN host.
    // An image URL on any other host is refused — the fix is adding the host
    // to NEXT_PUBLIC_IMAGE_HOSTS, the same allowlist next/image already uses.
    ["img-src", sources("'self'", "data:", "blob:", api, ...imageHosts)],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", sources("'self'", api, sentry, umami)],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...LIQPAY_CHECKOUT_ORIGINS]],
    // Matches `X-Frame-Options: SAMEORIGIN`, which stays for old browsers.
    ["frame-ancestors", ["'self'"]],
  ];

  // Only when the API is https: on a local `next start` against
  // http://localhost:3001 it would rewrite every API call to https and break it.
  if (api?.startsWith("https:")) {
    directives.push(["upgrade-insecure-requests", []]);
  }

  return directives
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}
