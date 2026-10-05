import type { ConfigService } from '@nestjs/config';
import { adminUrl } from './notification-links';

const config = (value: string | undefined) =>
  ({ get: jest.fn(() => value) }) as unknown as ConfigService;

describe('adminUrl', () => {
  it('joins the admin origin and the path', () => {
    expect(adminUrl(config('https://admin.example.com'), '/orders/42')).toBe(
      'https://admin.example.com/orders/42',
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(adminUrl(config('http://localhost:3002/'), '/orders/42')).toBe(
      'http://localhost:3002/orders/42',
    );
  });

  it.each([undefined, ''])(
    'returns null when STORE_ADMIN_URL is %p — never a guessed default',
    (v) => {
      expect(adminUrl(config(v), '/orders/42')).toBeNull();
    },
  );
});
