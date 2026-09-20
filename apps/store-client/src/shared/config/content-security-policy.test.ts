import {
  buildContentSecurityPolicy,
  LIQPAY_CHECKOUT_ORIGINS,
} from "./content-security-policy";

/** Split a policy into `directive → sources[]` for order-independent asserts. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      }),
  );
}

const base = { isDev: false };

describe("buildContentSecurityPolicy (TASK-452)", () => {
  it("locks down the directives that never depend on the deployment", () => {
    const csp = parse(buildContentSecurityPolicy(base));

    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'self'"]);
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["font-src"]).toEqual(["'self'", "data:"]);
  });

  it("allows inline scripts (no nonce — ISR) but never eval in production", () => {
    const csp = parse(buildContentSecurityPolicy(base));

    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(buildContentSecurityPolicy(base)).not.toContain("unsafe-eval");
  });

  it("adds 'unsafe-eval' in development only (React's dev error stacks)", () => {
    const csp = parse(buildContentSecurityPolicy({ isDev: true }));

    expect(csp["script-src"]).toContain("'unsafe-eval'");
  });

  it("lets the storefront post to the LiqPay checkout and nowhere else", () => {
    const csp = parse(buildContentSecurityPolicy(base));

    // Both provider hosts: `form-action` is enforced on REDIRECTS of the form
    // navigation too, so a 302 from www to the apex must not cancel a payment.
    expect(LIQPAY_CHECKOUT_ORIGINS).toEqual([
      "https://www.liqpay.ua",
      "https://liqpay.ua",
    ]);
    expect(csp["form-action"]).toEqual(["'self'", ...LIQPAY_CHECKOUT_ORIGINS]);
  });

  it("allows the API origin for XHR and for upload images", () => {
    const csp = parse(
      buildContentSecurityPolicy({
        ...base,
        apiUrl: "https://api.mystore.ua",
      }),
    );

    expect(csp["connect-src"]).toContain("https://api.mystore.ua");
    expect(csp["img-src"]).toContain("https://api.mystore.ua");
  });

  it("keeps the API port — dev's localhost:3001 is a different origin from :3000", () => {
    const csp = parse(
      buildContentSecurityPolicy({ ...base, apiUrl: "http://localhost:3001" }),
    );

    expect(csp["connect-src"]).toContain("http://localhost:3001");
  });

  it("allows each configured image host over https only", () => {
    const csp = parse(
      buildContentSecurityPolicy({
        ...base,
        imageHosts: ["cdn.mystore.ua", "images.brand.com"],
      }),
    );

    expect(csp["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://cdn.mystore.ua",
      "https://images.brand.com",
    ]);
  });

  it("drops an image host that is not a bare hostname", () => {
    // Sources are joined with spaces: a value carrying one would otherwise
    // splice an arbitrary second source (here a CSP keyword) into img-src.
    const csp = parse(
      buildContentSecurityPolicy({
        ...base,
        imageHosts: [
          "CDN.MyStore.UA",
          "evil.com 'unsafe-eval'",
          "cdn.example.com/path",
          "*.wildcard.com",
          "host:8443",
          "  ",
        ],
      }),
    );

    expect(csp["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://cdn.mystore.ua",
    ]);
  });

  it("allows Umami's origin for the tracker script and its beacons", () => {
    const csp = parse(
      buildContentSecurityPolicy({
        ...base,
        umamiSrc: "https://analytics.mystore.ua/script.js",
      }),
    );

    expect(csp["script-src"]).toContain("https://analytics.mystore.ua");
    expect(csp["connect-src"]).toContain("https://analytics.mystore.ua");
  });

  it("allows Sentry's ingest origin — never the DSN's public key", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      sentryDsn: "https://abc123@o42.ingest.de.sentry.io/4500",
    });
    const csp = parse(policy);

    expect(csp["connect-src"]).toContain("https://o42.ingest.de.sentry.io");
    expect(policy).not.toContain("abc123");
    // The SDK is bundled into our own chunks: no script origin needed.
    expect(csp["script-src"]).not.toContain("https://o42.ingest.de.sentry.io");
  });

  it("skips unset, empty and malformed values instead of emitting junk", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      apiUrl: "",
      umamiSrc: "not a url",
      sentryDsn: "javascript:alert(1)",
      imageHosts: [],
    });
    const csp = parse(policy);

    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(policy).not.toContain("undefined");
    expect(policy).not.toContain("javascript");
  });

  it("does not repeat an origin that two settings share", () => {
    const csp = parse(
      buildContentSecurityPolicy({
        ...base,
        apiUrl: "https://mystore.ua",
        umamiSrc: "https://mystore.ua/umami.js",
      }),
    );

    expect(
      csp["connect-src"].filter((source) => source === "https://mystore.ua"),
    ).toHaveLength(1);
  });

  it("upgrades insecure requests only when the API itself is https", () => {
    expect(
      parse(
        buildContentSecurityPolicy({
          ...base,
          apiUrl: "https://api.mystore.ua",
        }),
      ),
    ).toHaveProperty("upgrade-insecure-requests");
    // A local `next start` against http://localhost:3001 would otherwise have
    // every API call rewritten to https and fail.
    expect(
      parse(
        buildContentSecurityPolicy({
          ...base,
          apiUrl: "http://localhost:3001",
        }),
      ),
    ).not.toHaveProperty("upgrade-insecure-requests");
  });

  it("is a single header line", () => {
    expect(buildContentSecurityPolicy(base)).not.toMatch(/\n/);
  });
});
