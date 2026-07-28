import { createHash } from 'node:crypto';
import {
  LIQPAY_REFERENCE_VECTOR,
  LIQPAY_SIGNATURE_ALGORITHM,
  signLiqPayData,
  verifyLiqPaySignature,
} from './liqpay.signature';

/**
 * The pinned test vector (plan 163 §1, docs/payments-liqpay.md §9).
 *
 * LiqPay's docs name sha3-256 in prose while their abandoned SDKs and one stale
 * `openssl` snippet use sha1. The test below is how that was settled and how it
 * stays settled: it asserts our implementation reproduces the signature LiqPay
 * publishes for a known private_key/data pair. If LiqPay ever migrates the
 * algorithm again, THIS test goes red with a name that says what happened —
 * instead of every production callback failing verification in silence.
 *
 * The private key here is LiqPay's own documentation example value, not a secret.
 */
describe('LiqPay signature', () => {
  const { privateKey, data, signature } = LIQPAY_REFERENCE_VECTOR;

  describe('pinned reference vector (live docs, verified 2026-07-28)', () => {
    it('reproduces the signature LiqPay publishes for its worked example', () => {
      expect(signLiqPayData(data, privateKey)).toBe(signature);
    });

    it('uses sha3-256 — sha1 (the abandoned SDKs) does NOT reproduce the vector', () => {
      const sha1 = createHash('sha1')
        .update(privateKey + data + privateKey, 'utf8')
        .digest('base64');

      expect(LIQPAY_SIGNATURE_ALGORITHM).toBe('sha3-256');
      expect(sha1).not.toBe(signature);
    });

    it('produces a 32-byte digest (44 base64 chars), not sha1’s 20 bytes', () => {
      expect(Buffer.from(signature, 'base64')).toHaveLength(32);
      expect(signature).toHaveLength(44);
    });

    it("decodes to LiqPay's documented payload shape", () => {
      expect(JSON.parse(Buffer.from(data, 'base64').toString('utf8'))).toEqual({
        public_key: 'i00000000',
        version: 7,
        action: 'pay',
        amount: '3',
        currency: 'UAH',
        description: 'test',
        order_id: '000001',
      });
    });
  });

  describe('signLiqPayData', () => {
    it('hashes private_key + data + private_key, not data alone', () => {
      const bare = createHash(LIQPAY_SIGNATURE_ALGORITHM).update(data, 'utf8').digest('base64');

      expect(signLiqPayData(data, privateKey)).not.toBe(bare);
    });

    it('changes when the private key changes', () => {
      expect(signLiqPayData(data, 'a-different-private-key')).not.toBe(signature);
    });

    it('changes when a single byte of data changes', () => {
      expect(signLiqPayData(`${data} `, privateKey)).not.toBe(signature);
    });
  });

  describe('verifyLiqPaySignature', () => {
    it('accepts the signature it produces', () => {
      expect(verifyLiqPaySignature(data, signLiqPayData(data, privateKey), privateKey)).toBe(true);
    });

    it('accepts the published reference signature', () => {
      expect(verifyLiqPaySignature(data, signature, privateKey)).toBe(true);
    });

    it('rejects a signature made with a different private key', () => {
      expect(verifyLiqPaySignature(data, signLiqPayData(data, 'other-key'), privateKey)).toBe(
        false,
      );
    });

    it('rejects tampered data under an otherwise valid signature', () => {
      const tampered = Buffer.from(
        JSON.stringify({ public_key: 'i00000000', amount: '99999' }),
        'utf8',
      ).toString('base64');

      expect(verifyLiqPaySignature(tampered, signature, privateKey)).toBe(false);
    });

    it('returns false rather than throwing on malformed input', () => {
      expect(verifyLiqPaySignature(data, '', privateKey)).toBe(false);
      expect(verifyLiqPaySignature(data, 'not-base64!!', privateKey)).toBe(false);
      expect(verifyLiqPaySignature(data, signature, '')).toBe(false);
      expect(verifyLiqPaySignature(undefined as unknown as string, signature, privateKey)).toBe(
        false,
      );
      expect(verifyLiqPaySignature(data, undefined as unknown as string, privateKey)).toBe(false);
    });

    it('rejects a signature of the right shape but wrong content (length-safe)', () => {
      const wrongButSameLength = Buffer.alloc(32, 7).toString('base64');

      expect(wrongButSameLength).toHaveLength(44);
      expect(verifyLiqPaySignature(data, wrongButSameLength, privateKey)).toBe(false);
    });
  });
});
