import type { ConfigService } from '@nestjs/config';
import { adminUrl, storeUrl } from './notification-links';

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

describe('storeUrl (TASK-680)', () => {
  it('joins the storefront origin and the path, tolerating a trailing slash', () => {
    expect(storeUrl(config('https://shop.example.com/'), '/orders/status')).toBe(
      'https://shop.example.com/orders/status',
    );
  });

  it('reads STORE_CLIENT_URL, not the admin origin', () => {
    const get = jest.fn(() => 'https://shop.example.com');
    storeUrl({ get } as unknown as ConfigService, '/orders/status');
    expect(get).toHaveBeenCalledWith('STORE_CLIENT_URL');
  });

  it.each([undefined, ''])(
    'returns null when STORE_CLIENT_URL is %p — never a guessed default',
    (v) => {
      expect(storeUrl(config(v), '/orders/status')).toBeNull();
    },
  );
});
