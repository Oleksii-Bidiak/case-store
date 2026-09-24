import { buildEmailChangeConfirmEmail, buildEmailChangeNoticeEmail } from './email-change.template';

describe('email-change templates (TASK-396)', () => {
  describe('confirm letter (to the NEW address)', () => {
    const payload = {
      to: 'new@example.com',
      confirmUrl: 'https://shop.example/confirm-email-change?token=abc',
      expiresInHuman: '24 години',
    };

    it('carries the confirm link in both parts and the expiry', () => {
      const mail = buildEmailChangeConfirmEmail(payload);

      expect(mail.subject).toBe('Підтвердьте нову адресу для входу');
      expect(mail.html).toContain(payload.confirmUrl);
      expect(mail.text).toContain(payload.confirmUrl);
      expect(mail.text).toContain('24 години');
    });

    it('says the address does not change without the click', () => {
      expect(buildEmailChangeConfirmEmail(payload).text).toMatch(
        /без підтвердження адреса не зміниться/,
      );
    });
  });

  describe('notice (to the OLD address)', () => {
    const payload = {
      to: 'old@example.com',
      newEmail: 'new@example.com',
      revertUrl: 'https://shop.example/revert-email-change?token=xyz',
      revertExpiresInHuman: '7 днів',
    };

    it('names the requested address and carries the revert link', () => {
      const mail = buildEmailChangeNoticeEmail(payload);

      expect(mail.subject).toBe('Запит на зміну адреси для входу');
      expect(mail.html).toContain('new@example.com');
      expect(mail.html).toContain(payload.revertUrl);
      expect(mail.text).toContain(payload.revertUrl);
      expect(mail.text).toContain('7 днів');
    });

    it('escapes an address that tries to inject markup', () => {
      const mail = buildEmailChangeNoticeEmail({
        ...payload,
        newEmail: '"><script>alert(1)</script>@x.com',
      });

      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
    });
  });
});
