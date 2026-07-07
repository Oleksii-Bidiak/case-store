import { buildHelmetOptions } from './security.config';

type CspOption = {
  directives: Record<string, string[]>;
};

describe('buildHelmetOptions', () => {
  it('enables 1-year HSTS with subdomains in production', () => {
    const opts = buildHelmetOptions(true);
    expect(opts.strictTransportSecurity).toEqual({
      maxAge: 31536000,
      includeSubDomains: true,
    });
  });

  it('disables HSTS outside production', () => {
    expect(buildHelmetOptions(false).strictTransportSecurity).toBe(false);
  });

  it('locks scripts to self in production (no unsafe-inline)', () => {
    const csp = buildHelmetOptions(true).contentSecurityPolicy as CspOption;
    expect(csp.directives.scriptSrc).toEqual(["'self'"]);
    expect(csp.directives.upgradeInsecureRequests).toEqual([]);
  });

  it('relaxes CSP for the Swagger UI in development', () => {
    const csp = buildHelmetOptions(false).contentSecurityPolicy as CspOption;
    expect(csp.directives.scriptSrc).toContain("'unsafe-inline'");
    expect(csp.directives.scriptSrc).toContain('cdn.jsdelivr.net');
  });

  it('sets a strict-origin-when-cross-origin referrer policy', () => {
    expect(buildHelmetOptions(false).referrerPolicy).toEqual({
      policy: 'strict-origin-when-cross-origin',
    });
  });

  // ── TASK-261: optional Umami origin allowance ─────────────────────────────
  it('keeps scriptSrc/connectSrc at self-only in production when no Umami origin is given', () => {
    const csp = buildHelmetOptions(true).contentSecurityPolicy as CspOption;
    expect(csp.directives.scriptSrc).toEqual(["'self'"]);
    expect(csp.directives.connectSrc).toEqual(["'self'"]);
  });

  it('adds the Umami origin to scriptSrc and connectSrc in production when configured', () => {
    const origin = 'https://analytics.mystore.ua';
    const csp = buildHelmetOptions(true, origin).contentSecurityPolicy as CspOption;
    expect(csp.directives.scriptSrc).toEqual(["'self'", origin]);
    expect(csp.directives.connectSrc).toEqual(["'self'", origin]);
    // Unrelated directives are untouched.
    expect(csp.directives.styleSrc).toEqual(["'self'"]);
  });

  it('ignores the Umami origin outside production (dev CSP unchanged)', () => {
    const csp = buildHelmetOptions(false, 'https://analytics.mystore.ua')
      .contentSecurityPolicy as CspOption;
    expect(csp.directives.scriptSrc).not.toContain('https://analytics.mystore.ua');
    expect(csp.directives.connectSrc).toEqual(["'self'"]);
  });
});
