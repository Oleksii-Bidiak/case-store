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
});
