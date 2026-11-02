import { buildAccountSetupEmail, type AccountSetupMailPayload } from './account-setup.template';

const basePayload = (
  overrides: Partial<AccountSetupMailPayload> = {},
): AccountSetupMailPayload => ({
  to: 'olena@example.com',
  setupUrl: 'http://localhost:3000/account-setup?token=abc123def456',
  expiresInHuman: '24 години',
  ...overrides,
});

const hasHtmlTags = (s: string): boolean => /<[a-z][\s\S]*>/i.test(s);

/**
 * TASK-2010: the letter a checkout sign-up gets. It is the password step AND the
 * proof of the mailbox — the guest orders on this address move to the account
 * only once it is opened — so it says both, in Ukrainian.
 */
describe('buildAccountSetupEmail', () => {
  it('asks to set a password, in Ukrainian', () => {
    const { subject, html, text } = buildAccountSetupEmail(basePayload());

    expect(subject).toBe('Задайте пароль до акаунта');
    expect(html).toContain('lang="uk"');
    expect(text).toContain('Задайте пароль');
  });

  it('embeds the setup link verbatim in both parts', () => {
    const setupUrl = 'http://localhost:3000/account-setup?token=verbatim-token-xyz';
    const { html, text } = buildAccountSetupEmail(basePayload({ setupUrl }));

    expect(html).toContain(setupUrl);
    expect(text).toContain(setupUrl);
  });

  it('renders the expiry note', () => {
    const { html, text } = buildAccountSetupEmail(basePayload({ expiresInHuman: '2 дні' }));

    expect(html).toContain('2 дні');
    expect(text).toContain('2 дні');
  });

  it('says that opening the link also confirms the address', () => {
    const { html, text } = buildAccountSetupEmail(basePayload());

    expect(html).toContain('підтвердить');
    expect(text).toContain('підтвердить');
  });

  it('escapes the link in the HTML', () => {
    const { html } = buildAccountSetupEmail(
      basePayload({ setupUrl: 'http://x.test/a?token=1"><script>alert(1)</script>' }),
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('has no HTML tags in the plain-text body', () => {
    expect(hasHtmlTags(buildAccountSetupEmail(basePayload()).text)).toBe(false);
  });
});
