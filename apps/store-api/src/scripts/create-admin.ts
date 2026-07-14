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
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

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
    // Mirrors IsStrongAppPassword (min 8, upper + lower + digit). A password this
    // script accepts but the login form would reject is a trap door into a
    // half-broken account.
    if (!/^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).{8,}$/u.test(supplied)) {
      throw new Error(
        'The password must be at least 8 characters and contain a lowercase letter, an uppercase letter and a digit.',
      );
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
    const passwordHash = await argon2.hash(password);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {
        role: 'ADMIN',
        passwordHash,
        isActive: true,
        // Clears the audit tombstone: a soft-deleted admin is otherwise invisible
        // to the login path, and the upsert alone would leave it that way.
        deletedAt: null,
      },
      create: {
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      select: { id: true, email: true, createdAt: true },
    });

    console.log('');
    console.log('  Admin account ready.');
    console.log(`    email: ${admin.email}`);
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
