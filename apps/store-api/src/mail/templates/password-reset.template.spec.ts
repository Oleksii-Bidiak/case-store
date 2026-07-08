import { buildPasswordResetEmail, type PasswordResetMailPayload } from './password-reset.template';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const basePayload = (
  overrides: Partial<PasswordResetMailPayload> = {},
): PasswordResetMailPayload => ({
  to: 'user@example.com',
  resetUrl: 'http://localhost:3000/reset-password?token=abc123def456',
  expiresInHuman: '1 годину',
  ...overrides,
});

/** Strip HTML tags so we can assert the plain-text body carries no markup. */
const hasHtmlTags = (s: string): boolean => /<[a-z][\s\S]*>/i.test(s);

describe('buildPasswordResetEmail', () => {
  it('returns non-empty subject, html and text parts', () => {
    const { subject, html, text } = buildPasswordResetEmail(basePayload());

    expect(subject.length).toBeGreaterThan(0);
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it('is written in Ukrainian', () => {
    const { subject, html } = buildPasswordResetEmail(basePayload());

    expect(subject).toContain('Скидання пароля');
    expect(html).toContain('lang="uk"');
    expect(html).not.toContain('lang="en"');
  });

  it('embeds the reset URL verbatim in both the HTML and the plain text', () => {
    const resetUrl = 'http://localhost:3000/reset-password?token=verbatim-token-xyz';
    const { html, text } = buildPasswordResetEmail(basePayload({ resetUrl }));

    expect(html).toContain(resetUrl);
    expect(text).toContain(resetUrl);
  });

  it('renders the human-readable expiry note', () => {
    const { html, text } = buildPasswordResetEmail(basePayload({ expiresInHuman: '30 хвилин' }));

    expect(html).toContain('30 хвилин');
    expect(text).toContain('30 хвилин');
  });

  it('has no HTML tags in the plain-text body', () => {
    const { text } = buildPasswordResetEmail(basePayload());
    expect(hasHtmlTags(text)).toBe(false);
  });

  it('HTML-escapes any interpolated dynamic string (defensive)', () => {
    const { html } = buildPasswordResetEmail(
      basePayload({ expiresInHuman: '<script>alert(1)</script>' }),
    );

    // The raw script tag must never survive into the rendered HTML.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
