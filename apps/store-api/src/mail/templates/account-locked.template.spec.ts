import { buildAccountLockedEmail } from './account-locked.template';

describe('buildAccountLockedEmail (TASK-287)', () => {
  const payload = {
    to: 'banned@example.com',
    supportUrl: 'http://localhost:3000/contact',
  };

  it('renders a subject, HTML and plain-text body pointing at support', () => {
    const mail = buildAccountLockedEmail(payload);

    expect(mail.subject).toContain('недоступний');
    expect(mail.html).toContain('http://localhost:3000/contact');
    expect(mail.text).toContain('http://localhost:3000/contact');
  });

  it('never states WHY the account was locked (the mail is not an audit trail)', () => {
    const mail = buildAccountLockedEmail(payload);

    expect(mail.html.toLowerCase()).not.toContain('deactiv');
    expect(mail.html.toLowerCase()).not.toContain('deleted');
  });

  it('escapes the support URL before interpolating it into HTML', () => {
    const mail = buildAccountLockedEmail({
      to: 'banned@example.com',
      supportUrl: 'http://x.ua/contact?a="><script>alert(1)</script>',
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
