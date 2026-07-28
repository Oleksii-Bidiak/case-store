import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { PaymentOutcome } from '../../payment.types';
import { LiqPayAdapter } from './liqpay.adapter';
import { signLiqPayData } from './liqpay.signature';
import { LIQPAY_CHECKOUT_URL, mapLiqPayStatus } from './liqpay.types';

const PRIVATE_KEY = 'test_private_key';
const PUBLIC_KEY = 'sandbox_i00000000';
const API_URL = 'https://liqpay.test/api/request';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

function buildAdapter(env: Record<string, string | undefined> = {}): LiqPayAdapter {
  const values: Record<string, string | undefined> = {
    LIQPAY_PUBLIC_KEY: PUBLIC_KEY,
    LIQPAY_PRIVATE_KEY: PRIVATE_KEY,
    ...env,
  };
  const configMock = {
    get: jest.fn((key: string, def?: unknown) => values[key] ?? def),
  };
  return new LiqPayAdapter(
    configMock as unknown as ConfigService,
    loggerMock as unknown as PinoLogger,
    API_URL,
  );
}

/** Build the `{ data, signature }` pair LiqPay would POST for `body`. */
function signedCallback(body: Record<string, unknown>, privateKey = PRIVATE_KEY) {
  const data = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  return { data, signature: signLiqPayData(data, privateKey) };
}

function decodeFields(fields: Record<string, string>): Record<string, unknown> {
  return JSON.parse(Buffer.from(fields.data, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('LiqPayAdapter', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe('isConfigured', () => {
    it('is true only when both keys are present', () => {
      expect(buildAdapter().isConfigured()).toBe(true);
      expect(buildAdapter({ LIQPAY_PRIVATE_KEY: undefined }).isConfigured()).toBe(false);
      expect(buildAdapter({ LIQPAY_PUBLIC_KEY: undefined }).isConfigured()).toBe(false);
    });

    it('exposes the adapter key persisted on Payment.provider', () => {
      expect(buildAdapter().key).toBe('liqpay');
    });
  });

  describe('createCheckout', () => {
    const params = {
      paymentId: 'pay-1',
      amount: '1249.00',
      currency: 'UAH',
      description: 'Order #1001',
      resultUrl: 'https://shop.test/orders/o-1/confirmation',
      callbackUrl: 'https://api.shop.test/api/payments/liqpay/callback',
    };

    it('POSTs to the hosted checkout with a verifiable signature', async () => {
      const handoff = await buildAdapter().createCheckout(params);

      expect(handoff.url).toBe(LIQPAY_CHECKOUT_URL);
      expect(handoff.method).toBe('POST');
      expect(Object.keys(handoff.fields).sort()).toEqual(['data', 'signature']);
      expect(handoff.fields.signature).toBe(signLiqPayData(handoff.fields.data, PRIVATE_KEY));
    });

    it('sends the PAYMENT id as order_id — never the order id', async () => {
      const handoff = await buildAdapter().createCheckout(params);

      // The regression this guards: reusing Order.id burns it on the first
      // declined card and the customer can never retry (docs §3).
      expect(decodeFields(handoff.fields).order_id).toBe('pay-1');
    });

    it('carries amount, currency, description and both URLs', async () => {
      const payload = decodeFields((await buildAdapter().createCheckout(params)).fields);

      expect(payload).toMatchObject({
        action: 'pay',
        amount: '1249.00',
        currency: 'UAH',
        description: 'Order #1001',
        public_key: PUBLIC_KEY,
        result_url: params.resultUrl,
        server_url: params.callbackUrl,
      });
    });

    it('never puts the private key in the payload', async () => {
      const handoff = await buildAdapter().createCheckout(params);

      expect(Buffer.from(handoff.fields.data, 'base64').toString('utf8')).not.toContain(
        PRIVATE_KEY,
      );
    });

    it('defaults paytypes without payparts (no bank agreement by default)', async () => {
      const payload = decodeFields((await buildAdapter().createCheckout(params)).fields);

      expect(payload.paytypes).toBe('card,apay,gpay,privat24');
      expect(String(payload.paytypes)).not.toContain('payparts');
    });

    it('honours a configured LIQPAY_PAYTYPES', async () => {
      const adapter = buildAdapter({ LIQPAY_PAYTYPES: 'card,payparts' });

      expect(decodeFields((await adapter.createCheckout(params)).fields).paytypes).toBe(
        'card,payparts',
      );
    });

    it('sets the sandbox flag only when configured for sandbox', async () => {
      const live = decodeFields((await buildAdapter().createCheckout(params)).fields);
      const sandbox = decodeFields(
        (await buildAdapter({ LIQPAY_SANDBOX: 'true' }).createCheckout(params)).fields,
      );

      expect(live.sandbox).toBeUndefined();
      expect(sandbox.sandbox).toBe('1');
    });

    it('throws loudly rather than returning an unsigned handoff when unconfigured', async () => {
      await expect(
        buildAdapter({ LIQPAY_PRIVATE_KEY: undefined }).createCheckout(params),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('parseCallback', () => {
    it('translates a verified success callback', async () => {
      const body = {
        order_id: 'pay-1',
        status: 'success',
        payment_id: 987654,
        amount: 1249,
        currency: 'UAH',
      };

      const event = await buildAdapter().parseCallback(signedCallback(body));

      expect(event).toMatchObject({
        paymentId: 'pay-1',
        providerStatus: 'success',
        providerPaymentId: '987654',
        outcome: PaymentOutcome.SUCCEEDED,
        amount: '1249',
        currency: 'UAH',
      });
    });

    it('returns null for a signature made with the wrong private key', async () => {
      const forged = signedCallback({ order_id: 'pay-1', status: 'success' }, 'attacker-key');

      expect(await buildAdapter().parseCallback(forged)).toBeNull();
    });

    it('returns null when data is tampered with after signing', async () => {
      const { signature } = signedCallback({ order_id: 'pay-1', status: 'failure' });
      const swapped = Buffer.from(
        JSON.stringify({ order_id: 'pay-1', status: 'success', amount: 1 }),
        'utf8',
      ).toString('base64');

      expect(await buildAdapter().parseCallback({ data: swapped, signature })).toBeNull();
    });

    it('returns null for a malformed body instead of throwing', async () => {
      const adapter = buildAdapter();

      expect(await adapter.parseCallback(undefined)).toBeNull();
      expect(await adapter.parseCallback({})).toBeNull();
      expect(await adapter.parseCallback({ data: 'x' })).toBeNull();
      expect(await adapter.parseCallback({ data: 1, signature: 2 })).toBeNull();
    });

    it('returns null when a correctly signed payload is not JSON', async () => {
      const data = Buffer.from('not json at all', 'utf8').toString('base64');

      expect(
        await buildAdapter().parseCallback({ data, signature: signLiqPayData(data, PRIVATE_KEY) }),
      ).toBeNull();
    });

    it('returns null when a signed payload cannot be attributed to a payment', async () => {
      expect(await buildAdapter().parseCallback(signedCallback({ status: 'success' }))).toBeNull();
      expect(await buildAdapter().parseCallback(signedCallback({ order_id: 'p' }))).toBeNull();
    });

    it('collapses a missing provider payment id to "" for the idempotency key', async () => {
      const event = await buildAdapter().parseCallback(
        signedCallback({ order_id: 'pay-1', status: 'processing' }),
      );

      // NOT undefined/null: two NULLs never collide in a Postgres unique index,
      // which would let duplicate callbacks through.
      expect(event?.providerPaymentId).toBe('');
    });

    it('keeps LiqPay error details verbatim for support', async () => {
      const event = await buildAdapter().parseCallback(
        signedCallback({
          order_id: 'pay-1',
          status: 'failure',
          err_code: '9859',
          err_description: 'Ліміт вичерпано',
        }),
      );

      expect(event).toMatchObject({
        outcome: PaymentOutcome.FAILED,
        failureCode: '9859',
        failureMessage: 'Ліміт вичерпано',
      });
    });
  });

  describe('status map (docs §7 — four buckets, default deny)', () => {
    it.each(['success'])('%s → SUCCEEDED', (status) => {
      expect(mapLiqPayStatus(status, false)).toBe(PaymentOutcome.SUCCEEDED);
    });

    it.each(['failure', 'error', 'expired'])('%s → FAILED', (status) => {
      expect(mapLiqPayStatus(status, false)).toBe(PaymentOutcome.FAILED);
    });

    it('reversed → REFUNDED', () => {
      expect(mapLiqPayStatus('reversed', false)).toBe(PaymentOutcome.REFUNDED);
    });

    it.each([
      'processing',
      'wait_secure',
      'wait_accept',
      '3ds_verify',
      'otp_verify',
      'cvv_verify',
      'hold_wait',
      'prepared',
      'wait_sender',
      'captcha_verify',
    ])('%s → IGNORED (still in progress)', (status) => {
      expect(mapLiqPayStatus(status, false)).toBe(PaymentOutcome.IGNORED);
    });

    it('defaults an unknown/future status to IGNORED, never to paid', () => {
      expect(mapLiqPayStatus('some_status_liqpay_adds_in_2027', false)).toBe(
        PaymentOutcome.IGNORED,
      );
      expect(mapLiqPayStatus('', false)).toBe(PaymentOutcome.IGNORED);
    });
  });

  describe('the sandbox trap', () => {
    it('treats "sandbox" as SUCCEEDED only when LIQPAY_SANDBOX=true', () => {
      expect(mapLiqPayStatus('sandbox', true)).toBe(PaymentOutcome.SUCCEEDED);
    });

    it('treats "sandbox" as FAILED when sandbox mode is off', () => {
      // Left ungated this is the whole vulnerability: anyone who learns the
      // merchant public key could mark orders paid (docs §6).
      expect(mapLiqPayStatus('sandbox', false)).toBe(PaymentOutcome.FAILED);
    });

    it('a production adapter refuses a sandbox callback end to end', async () => {
      const event = await buildAdapter({ LIQPAY_SANDBOX: undefined }).parseCallback(
        signedCallback({ order_id: 'pay-1', status: 'sandbox', amount: 1249, currency: 'UAH' }),
      );

      expect(event?.outcome).toBe(PaymentOutcome.FAILED);
    });

    it('a sandbox adapter accepts the same callback', async () => {
      const event = await buildAdapter({ LIQPAY_SANDBOX: 'true' }).parseCallback(
        signedCallback({ order_id: 'pay-1', status: 'sandbox', amount: 1249, currency: 'UAH' }),
      );

      expect(event?.outcome).toBe(PaymentOutcome.SUCCEEDED);
    });

    it('warns when sandbox is enabled under NODE_ENV=production', () => {
      buildAdapter({ LIQPAY_SANDBOX: 'true', NODE_ENV: 'production' });

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.liqpay.sandbox_in_production' }),
        expect.any(String),
      );
    });
  });

  describe('fetchStatus', () => {
    it('posts a signed status request to the injected base URL', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ order_id: 'pay-1', status: 'success', amount: 10, currency: 'UAH' }),
      } as unknown as Response);

      const event = await buildAdapter().fetchStatus('pay-1');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(API_URL);
      const sent = new URLSearchParams((init as RequestInit).body as string);
      expect(JSON.parse(Buffer.from(sent.get('data')!, 'base64').toString('utf8'))).toMatchObject({
        action: 'status',
        order_id: 'pay-1',
      });
      expect(sent.get('signature')).toBe(signLiqPayData(sent.get('data')!, PRIVATE_KEY));
      expect(event?.outcome).toBe(PaymentOutcome.SUCCEEDED);
    });

    it('attributes the answer to the polled payment when LiqPay omits order_id', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', amount: 10, currency: 'UAH' }),
      } as unknown as Response);

      expect((await buildAdapter().fetchStatus('pay-1'))?.paymentId).toBe('pay-1');
    });

    it('returns null (leave it PENDING) when LiqPay is unreachable', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

      expect(await buildAdapter().fetchStatus('pay-1')).toBeNull();
    });

    it('returns null on a non-OK HTTP status', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: false, status: 502 } as unknown as Response);

      expect(await buildAdapter().fetchStatus('pay-1')).toBeNull();
    });

    it('returns null when the response is not JSON', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as Response);

      expect(await buildAdapter().fetchStatus('pay-1')).toBeNull();
    });
  });

  describe('refund', () => {
    it('posts a signed refund request', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'reversed' }),
      } as unknown as Response);

      await buildAdapter().refund({ paymentId: 'pay-1', amount: '1249.00' });

      const sent = new URLSearchParams((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(JSON.parse(Buffer.from(sent.get('data')!, 'base64').toString('utf8'))).toMatchObject({
        action: 'refund',
        order_id: 'pay-1',
        amount: '1249.00',
      });
    });

    it('resolves without reporting REFUNDED — the reversed callback confirms it', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'reversed' }),
      } as unknown as Response);

      await expect(
        buildAdapter().refund({ paymentId: 'pay-1', amount: '1' }),
      ).resolves.toBeUndefined();
    });

    it('accepts an async settling status', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'wait_reserve' }),
      } as unknown as Response);

      await expect(
        buildAdapter().refund({ paymentId: 'pay-1', amount: '1' }),
      ).resolves.toBeUndefined();
    });

    it('throws when LiqPay refuses, so the admin button does not lie', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'error', err_description: 'refund not permitted' }),
      } as unknown as Response);

      await expect(buildAdapter().refund({ paymentId: 'pay-1', amount: '1' })).rejects.toThrow(
        /refund not permitted/,
      );
    });

    it('throws when LiqPay is unreachable', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

      await expect(buildAdapter().refund({ paymentId: 'pay-1', amount: '1' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
