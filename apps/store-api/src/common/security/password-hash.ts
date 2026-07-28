/**
 * The one place the application turns a plaintext password into a stored hash
 * (TASK-333).
 *
 * Before this existed `argon2.hash(...)` appeared three times — twice in
 * `auth.service.ts` (register, confirm-reset) and once in
 * `scripts/create-admin.ts`. Three call sites are three chances to drift: the
 * day someone tunes the cost parameters, or moves off argon2id, the site they
 * forget produces hashes the login path still accepts but which are weaker than
 * the policy claims — and nothing fails loudly to say so.
 *
 * Deliberately dependency-free (no NestJS, no ConfigService): `create-admin.ts`
 * is a standalone `node dist/scripts/create-admin.js` recovery tool that must
 * keep working when the application container cannot boot at all, which is
 * precisely when it is needed.
 */
import * as argon2 from 'argon2';

/**
 * Hash a plaintext password for storage in `User.passwordHash`.
 *
 * Uses argon2's library defaults (argon2id, m=64MiB, t=3, p=4), which is what
 * every existing hash in the database was produced with — changing them here
 * without a rehash-on-login path would silently leave old hashes at the old
 * cost, so treat this function as the single decision point for that migration.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext);
}

/**
 * Verify a plaintext password against a stored hash.
 *
 * Returns `false` for a mismatch. Never call this with a null/undefined hash —
 * a password-less (Google-only) account must be routed to the same generic
 * rejection as "no such user" by the caller, not distinguished here.
 */
export function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
