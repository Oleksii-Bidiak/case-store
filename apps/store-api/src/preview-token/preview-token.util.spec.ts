import {
  PREVIEW_TOKEN_TTL_SECONDS,
  derivePreviewKey,
  parseScope,
  signPreviewToken,
  verifyPreviewToken,
} from './preview-token.util';

const key = derivePreviewKey('a-jwt-secret-that-is-at-least-32-characters');
const now = 1_800_000_000;

describe('preview token util (TASK-668)', () => {
  it('round-trips a signed payload', () => {
    const token = signPreviewToken({ sc: 'home', exp: now + 60, v: 3 }, key);
    expect(verifyPreviewToken(token, key, now)).toEqual({ sc: 'home', exp: now + 60, v: 3 });
  });

  it('rejects an expired token, including at the exact expiry second', () => {
    const token = signPreviewToken({ sc: 'home', exp: now, v: 0 }, key);
    expect(verifyPreviewToken(token, key, now)).toBeNull();
    expect(verifyPreviewToken(token, key, now + 1)).toBeNull();
    expect(verifyPreviewToken(token, key, now - 1)).not.toBeNull();
  });

  it('rejects a token signed with another key (the JWT secret itself included)', () => {
    const token = signPreviewToken({ sc: 'home', exp: now + 60, v: 0 }, key);
    const otherKey = derivePreviewKey('another-jwt-secret-that-is-at-least-32-chars');
    expect(verifyPreviewToken(token, otherKey, now)).toBeNull();
    const rawJwtKey = Buffer.from('a-jwt-secret-that-is-at-least-32-characters');
    expect(
      verifyPreviewToken(
        signPreviewToken({ sc: 'home', exp: now + 60, v: 0 }, rawJwtKey),
        key,
        now,
      ),
    ).toBeNull();
  });

  it('rejects a tampered body — widening the scope breaks the signature', () => {
    const token = signPreviewToken(
      { sc: 'product:550e8400-e29b-41d4-a716-446655440000', exp: now + 60, v: 0 },
      key,
    );
    const [, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sc: 'home', exp: now + 60, v: 0 })).toString(
      'base64url',
    );
    expect(verifyPreviewToken(`${forgedBody}.${signature}`, key, now)).toBeNull();
    // and a token whose signature was flipped
    expect(verifyPreviewToken(`${token}x`, key, now)).toBeNull();
  });

  it('rejects garbage of every shape', () => {
    for (const bad of [undefined, '', 'abc', 'a.b.c', '.', 'x'.repeat(2000), 42]) {
      expect(verifyPreviewToken(bad, key, now)).toBeNull();
    }
  });

  it('rejects a well-signed payload with an unknown scope or a broken field', () => {
    for (const payload of [
      { sc: 'admin', exp: now + 60, v: 0 },
      { sc: 'product:', exp: now + 60, v: 0 },
      { sc: 'home', exp: 'tomorrow', v: 0 },
      { sc: 'home', exp: now + 60, v: 1.5 },
    ]) {
      const token = signPreviewToken(payload as never, key);
      expect(verifyPreviewToken(token, key, now)).toBeNull();
    }
  });

  it('parses the four scopes and nothing else', () => {
    expect(parseScope('home')).toEqual({ type: 'home' });
    expect(parseScope('page:550e8400-e29b-41d4-a716-446655440000')).toEqual({
      type: 'page',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(parseScope('post:abc')).toEqual({ type: 'post', id: 'abc' });
    expect(parseScope('product:x;drop')).toBeNull();
    expect(parseScope('order:1')).toBeNull();
  });

  it('lives 24 hours', () => {
    expect(PREVIEW_TOKEN_TTL_SECONDS).toBe(86_400);
  });
});
