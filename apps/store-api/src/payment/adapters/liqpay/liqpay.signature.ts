import { createHash } from 'node:crypto';
import { safeEqual } from '../../../csrf/csrf.util';

/**
 * LiqPay request/callback signing — the single most fragile thing in the whole
 * payment integration, which is why it lives alone in its own file (plan 163,
 * docs/payments-liqpay.md §9).
 *
 * ## Which algorithm, and how we know
 *
 * LiqPay's own material contradicts itself, so this was settled by experiment
 * against the worked example published on the live docs (verified 2026-07-28,
 * https://www.liqpay.ua/en/doc) rather than by reading prose:
 *
 * | Source                                    | Says     |
 * | ----------------------------------------- | -------- |
 * | Live docs prose (`/en/doc`, `/uk/doc`)    | sha3-256 |
 * | Live docs **worked example**              | sha3-256 |
 * | Live callback page's `openssl` snippet    | sha1     |
 * | Official PHP / Python / Java SDKs         | sha1     |
 *
 * Feeding the published `private_key` + `data` pair through both hashes, only
 * **sha3-256** reproduces the published `signature` byte for byte; sha1 produces
 * something else entirely. See {@link LIQPAY_REFERENCE_VECTOR} and its spec — the
 * assertion IS the evidence, and it re-runs on every CI build.
 *
 * The SDKs are stale, not authoritative: the Node SDK is abandoned outright and
 * the others still emit the pre-migration 20-byte signature. The `openssl -sha1`
 * line on the callback page is the same leftover — the "expected signature" it
 * prints alongside is 28 base64 chars (a 20-byte digest), whereas every current
 * example is 44 chars (32 bytes). We do not vendor any of them.
 *
 * **If LiqPay migrates again**, `liqpay.signature.spec.ts` goes red with a named
 * failure instead of production payments silently failing verification.
 */

/**
 * Node `crypto` algorithm id. `sha3-256` requires OpenSSL 1.1.1+, which every
 * Node 18+ runtime ships; the module-load self-check below turns a hypothetical
 * unsupported build into a startup crash rather than a runtime 400 storm.
 */
export const LIQPAY_SIGNATURE_ALGORITHM = 'sha3-256';

/**
 * The reference pair published in LiqPay's live documentation, kept here so the
 * spec and this module cannot drift apart. `privateKey` is LiqPay's own public
 * example value — it is not a credential.
 */
export const LIQPAY_REFERENCE_VECTOR = {
  privateKey: 'a4825234f4bae72a0be04eafe9e8e2bada209255',
  data:
    'eyJwdWJsaWNfa2V5IjoiaTAwMDAwMDAwIiwidmVyc2lvbiI6NywiYWN0aW9uIjoicGF5IiwiYW1vdW50IjoiMyIsI' +
    'mN1cnJlbmN5IjoiVUFIIiwiZGVzY3JpcHRpb24iOiJ0ZXN0Iiwib3JkZXJfaWQiOiIwMDAwMDEifQ==',
  signature: '0adgJ8F2Ds5HCVkcz4AlmdLMRoIJf7IxsL3QmeFRz/s=',
} as const;

/**
 * `base64( sha3-256( private_key + data + private_key ) )`.
 *
 * `data` is the already-base64-encoded payload; it is hashed as the ASCII string
 * LiqPay sent/expects, never re-encoded. The digest is taken raw (binary) before
 * base64 — hex-then-base64 is the classic way to get a signature that looks
 * plausible and never verifies.
 */
export function signLiqPayData(data: string, privateKey: string): string {
  return createHash(LIQPAY_SIGNATURE_ALGORITHM)
    .update(privateKey + data + privateKey, 'utf8')
    .digest('base64');
}

/**
 * Constant-time signature check for an inbound callback.
 *
 * Timing-safe via the existing {@link safeEqual} (`csrf.util.ts`): a
 * short-circuiting `===` leaks, byte by byte, how much of a guessed signature was
 * correct, which is enough to forge one over many attempts. Returns false — never
 * throws — for missing or malformed input, so the caller has exactly one failure
 * path to handle.
 */
export function verifyLiqPaySignature(
  data: string,
  signature: string,
  privateKey: string,
): boolean {
  if (typeof data !== 'string' || typeof signature !== 'string' || !privateKey) {
    return false;
  }
  return safeEqual(signature, signLiqPayData(data, privateKey));
}

// Fail at import time on a crypto build without SHA3 rather than at the first
// callback: an unsigned-able adapter must not reach production quietly.
if (!createHash(LIQPAY_SIGNATURE_ALGORITHM)) {
  throw new Error(`Node crypto does not support ${LIQPAY_SIGNATURE_ALGORITHM}`);
}
