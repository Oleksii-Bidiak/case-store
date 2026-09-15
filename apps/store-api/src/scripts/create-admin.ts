/**
 * create-admin — restore or create exactly ONE admin account (TASK-308).
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SEED
 * ----------------------------------------
 * If the only admin account is ever deleted or locked out, you are shut out of
 * your own shop. The obvious lever — `npm run db:seed` with ALLOW_PROD_SEED=true
 * — is a trap: that seed does not just create an admin, it upserts an entire
 * demo catalogue (products, categories, orders, reviews, customers) over your
 * live data. Reaching for it in a panic is how a lockout becomes a catastrophe.
 *
 * This script writes ONE row in ONE table and touches nothing else.
 *
 * It does NOT weaken security. It requires shell access to the server (or the
 * production DATABASE_URL), which is the same level of access as `psql` — anyone
 * who can run it could already write the row by hand. What it adds is doing it
 * *correctly*: argon2-hashed exactly as the login path expects, so the account
 * actually works, and `deletedAt` cleared so a soft-deleted admin comes back.
 *
 * ─── Usage (on the server) ─────────────────────────────────────────────────
 *   docker compose -f docker-compose.prod.yml exec store-api \
 *     node dist/scripts/create-admin.js --email you@example.com
 *
 * Without --password one is generated and printed ONCE. Copy it, sign in, change
 * it. The password is never logged anywhere else.
 *
 * Re-running for an existing email PROMOTES that account to ADMIN and resets its
 * password — which is also how you recover from "I forgot the admin password".
 *
 * It also CLAIMS ownership of the shop if nobody currently holds it (TASK-475):
 * an ADMIN is only a deputy, and a shop with no `isOwner` row cannot appoint one
 * through any route. It never moves ownership that already belongs to somebody —
 * that is `POST /api/admin/staff/:id/transfer-ownership` and nothing else.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../common/security';
import {
  PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MESSAGE,
  STAFF_PASSWORD_REGEX,
} from '../common/validators';

type Args = { email: string; password: string; generated: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const email = read('--email') ?? process.env.ADMIN_EMAIL;
  if (!email || !email.includes('@')) {
    throw new Error('Usage: create-admin --email <address> [--password <password>]');
  }

  const supplied = read('--password') ?? process.env.ADMIN_PASSWORD;
  if (supplied) {
    // This script mints an ADMIN, so it answers to the STAFF policy — imported
    // rather than re-typed (TASK-407). It used to carry its own copy of the
    // regex, and a hand-copied rule is a rule that drifts: the moment the
    // shopper policy loosened, that copy silently became "whatever it said in
    // 2026". A password this script accepts but the login form rejects is a trap
    // door into a half-broken account.
    if (supplied.length < PASSWORD_MIN_LENGTH || !STAFF_PASSWORD_REGEX.test(supplied)) {
      throw new Error(`${STAFF_PASSWORD_MESSAGE} (minimum ${PASSWORD_MIN_LENGTH} characters).`);
    }
    return { email, password: supplied, generated: false };
  }

  // base64url of 18 random bytes: 24 chars, always contains the required classes
  // by construction below.
  const random = randomBytes(18).toString('base64url');
  return { email, password: `Aa1${random}`, generated: true };
}

async function main() {
  const { email, password, generated } = parseArgs();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Shared with the login path (TASK-333) — a hash produced by a second,
    // drifted copy of argon2 options is a password that silently does not work.
    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {
        role: 'ADMIN',
        passwordHash,
        isActive: true,
        // Clears the audit tombstone: a soft-deleted admin is otherwise invisible
        // to the login path, and the upsert alone would leave it that way.
        deletedAt: null,
        // TASK-333: without these, an admin recovered here can still be inside
        // the 15-minute TASK-314 lockout — and `login()` checks the lock BEFORE
        // it checks the password, so the brand-new password this script just
        // printed is rejected with the same generic "Invalid credentials". The
        // operator, already in a lockout emergency, concludes the recovery tool
        // is broken. Repeated failed logins are exactly how you get here.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      select: { id: true, email: true, createdAt: true, isOwner: true },
    });

    // ── Ownership ────────────────────────────────────────────────────────────
    // An ADMIN is a DEPUTY since TASK-475; the shop's authority lives on
    // `User.isOwner`. Without this block the break-glass tool produced a level-2
    // account and left the shop ownerless — a state nothing in the API can
    // repair, because appointing an owner is the one act only an owner may
    // perform (`@OwnerOnly` on transfer-ownership) and appointing a second admin
    // needs a level strictly above ADMIN. So a lockout recovery would hand back
    // an account that cannot hire, cannot touch another admin, and cannot pass
    // the shop on.
    //
    // Claimed rather than assigned: if the shop already HAS an owner this must
    // not move it — that is a deliberate act with its own door, dialog and audit
    // row. So the flag is set only when nobody holds it, which also makes the
    // repair idempotent. Two concurrent runs cannot produce two owners; the
    // partial unique index `users_single_owner_key` rejects the second outright,
    // and a loud failure here is the correct outcome.
    const owner = await prisma.user.findFirst({
      where: { isOwner: true },
      select: { email: true },
    });

    let claimedOwnership = false;
    if (!owner) {
      await prisma.user.update({ where: { id: admin.id }, data: { isOwner: true } });
      claimedOwnership = true;
    }

    console.log('');
    console.log('  Admin account ready.');
    console.log(`    email: ${admin.email}`);
    if (claimedOwnership) {
      console.log('    level: OWNER (the shop had none — this account now owns it)');
    } else if (admin.isOwner) {
      console.log('    level: OWNER');
    } else {
      console.log(`    level: ADMIN (deputy) — the shop is owned by ${owner?.email ?? 'unknown'}`);
    }
    if (generated) {
      console.log(`    password: ${password}`);
      console.log('');
      console.log('  This password is shown ONCE and is not stored anywhere in plain text.');
      console.log('  Sign in and change it.');
    } else {
      console.log('    password: (the one you supplied)');
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`create-admin failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
