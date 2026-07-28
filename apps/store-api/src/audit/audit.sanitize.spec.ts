import { bodyToDiff, sanitizeForAudit, REDACTED } from './audit.sanitize';

/**
 * The audit log is the one table an operator reads casually, exports, and pastes
 * into a support ticket. Anything that lands in it has effectively been
 * published — so these tests are about what must NEVER appear, not about
 * formatting.
 */
describe('audit sanitisation (TASK-318)', () => {
  describe('secrets', () => {
    it.each([
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'token',
      'totpSecret',
      'codeHash',
      'apiKey',
      'authorization',
      'cookie',
      'cvv',
    ])('redacts %s', (key) => {
      const result = sanitizeForAudit({ [key]: 'super-secret-value' }) as Record<string, unknown>;

      expect(result[key]).toBe(REDACTED);
      expect(JSON.stringify(result)).not.toContain('super-secret-value');
    });

    it('redacts by key SHAPE, so a field nobody thought of is covered too', () => {
      // The deny-list matches substrings case-insensitively. A field added
      // tomorrow called `smtpPassword` or `webhookSecret` is already covered —
      // which is the point, because nobody will remember to update this file.
      const result = sanitizeForAudit({
        smtpPassword: 'x',
        webhookSecret: 'y',
        MFA_BACKUPCODE: 'z',
      });

      expect(JSON.stringify(result)).not.toContain('"x"');
      expect(JSON.stringify(result)).not.toContain('"y"');
      expect(JSON.stringify(result)).not.toContain('"z"');
    });

    it('redacts at any nesting depth', () => {
      const result = sanitizeForAudit({
        user: { profile: { passwordHash: '$argon2id$leaked' } },
      });

      expect(JSON.stringify(result)).not.toContain('argon2id');
    });
  });

  describe('size bounds', () => {
    it('truncates a long string rather than storing a whole blog post', () => {
      const result = sanitizeForAudit({ content: 'a'.repeat(2000) }) as Record<string, string>;

      expect(result.content.length).toBeLessThan(600);
      expect(result.content).toContain('[+1500]');
    });

    it('summarises an oversized array by length', () => {
      const result = sanitizeForAudit({ ids: Array.from({ length: 500 }, (_, i) => i) }) as Record<
        string,
        string
      >;

      expect(result.ids).toBe('[500 items]');
    });

    it('stops walking at a bounded depth', () => {
      const deep = { a: { b: { c: { d: { e: { f: 'bottom' } } } } } };

      expect(JSON.stringify(sanitizeForAudit(deep))).not.toContain('bottom');
    });
  });

  describe('bodyToDiff', () => {
    it('records the fields the caller sent as `to` values', () => {
      expect(bodyToDiff({ price: 499, name: 'Case' })).toEqual({
        price: { to: 499 },
        name: { to: 'Case' },
      });
    });

    it('never emits `from` — a generic interceptor has no pre-image to record', () => {
      const diff = bodyToDiff({ price: 499 }) as Record<string, Record<string, unknown>>;

      // Inventing a `from` from the response would record the NEW value twice
      // under two labels, which is worse than an honest gap.
      expect(Object.keys(diff.price)).toEqual(['to']);
    });

    it('keeps the KEY of a redacted field, so the change is still visible', () => {
      // "The password was changed at 14:03" is the audit entry that matters;
      // the value is exactly what must not be there.
      expect(bodyToDiff({ newPassword: 'hunter2' })).toEqual({
        newPassword: { to: REDACTED },
      });
    });

    it('returns undefined for a body with nothing worth recording', () => {
      expect(bodyToDiff(undefined)).toBeUndefined();
      expect(bodyToDiff({})).toBeUndefined();
      expect(bodyToDiff('a string')).toBeUndefined();
      expect(bodyToDiff([1, 2, 3])).toBeUndefined();
    });
  });
});
