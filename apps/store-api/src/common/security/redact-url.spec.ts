import { createHash } from 'crypto';
import { redactUrlSecrets } from './redact-url';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const REF = createHash('sha256').update(TOKEN).digest('hex').slice(0, 8);

describe('redactUrlSecrets', () => {
  it.each([
    [`/api/orders/guest/${TOKEN}`, `/api/orders/guest/[token:${REF}]`],
    [
      `/api/orders/guest/${TOKEN}/notifications/telegram`,
      `/api/orders/guest/[token:${REF}]/notifications/telegram`,
    ],
    [
      `/api/orders/guest/${TOKEN}/notifications/telegram/link`,
      `/api/orders/guest/[token:${REF}]/notifications/telegram/link`,
    ],
    [`/api/orders/guest/${TOKEN}?x=1`, `/api/orders/guest/[token:${REF}]?x=1`],
  ])('masks the guest order token in %s', (url, expected) => {
    expect(redactUrlSecrets(url)).toBe(expected);
    expect(redactUrlSecrets(url)).not.toContain(TOKEN);
  });

  it('keeps a stable reference, so the lines of one token can still be tied together', () => {
    expect(redactUrlSecrets(`/api/orders/guest/${TOKEN}`)).toBe(
      redactUrlSecrets(`/api/orders/guest/${TOKEN}/notifications/telegram`)?.replace(
        '/notifications/telegram',
        '',
      ),
    );
  });

  it.each(['/api/products', '/api/orders/lookup', '/api/orders/guest', '/health'])(
    'leaves %s alone',
    (url) => {
      expect(redactUrlSecrets(url)).toBe(url);
    },
  );

  it('passes undefined through', () => {
    expect(redactUrlSecrets(undefined)).toBeUndefined();
  });
});
