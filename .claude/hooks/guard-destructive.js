#!/usr/bin/env node
/**
 * PreToolUse hook (Bash|PowerShell) — destructive-command guardrails.
 *
 * Companion to guard-bash.js (GitFlow + .env secrets). This one covers the
 * commands that destroy data rather than leak it. It is deliberately dumb —
 * regex only, no model in the loop — so it fires every time, including on a
 * confused or misled agent.
 *
 * Blocks:
 *   - `prisma migrate reset`      — drops and recreates the whole database
 *   - `--accept-data-loss` / `--force-reset` — lets `db push` silently drop
 *     columns/tables to make the schema match; the repo deploys with
 *     `prisma migrate deploy` precisely to avoid this (TASK-303)
 *   - any mutating prisma command aimed at a NON-LOCAL database host — the
 *     staging/production databases are never a valid target from a dev machine
 *   - `docker compose ... down -v` — `-v` deletes the named volumes, i.e. the
 *     Postgres data directory and the uploaded product images
 *   - force-push to `main` or `develop` — rewrites shared history
 *
 * Exit code 2 + stderr blocks the tool call and tells Claude why.
 */

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input || '{}');
  } catch {
    process.exit(0);
  }

  const cmd = (payload?.tool_input?.command || '').trim();
  if (!cmd) process.exit(0);

  const block = (message) => {
    console.error(`Blocked: ${message}`);
    process.exit(2);
  };

  // ── Prisma: outright destructive flags/subcommands ────────────────────────
  if (/\bprisma\b[\s\S]*\bmigrate\s+reset\b/i.test(cmd)) {
    block(
      '`prisma migrate reset` DROPS the entire database and re-applies migrations from scratch. ' +
        'If you need a clean local database, say so and ask the user to run it themselves.',
    );
  }

  if (/--accept-data-loss\b|--force-reset\b/i.test(cmd)) {
    block(
      'this flag lets Prisma drop tables/columns to force the schema to match. ' +
        'Schema changes go through a migration: `prisma migrate dev` locally, `prisma migrate deploy` on a server (TASK-303).',
    );
  }

  // ── Prisma: mutating command pointed at a non-local database ──────────────
  // Only inline DATABASE_URL=... assignments are visible here; an URL inherited
  // from the environment cannot be inspected, which is exactly why servers are
  // never administered from this machine in the first place.
  const mutatesSchema =
    /\bprisma\b[\s\S]*\b(migrate\s+(deploy|dev)|db\s+push|db\s+execute|db\s+seed)\b/i.test(cmd);
  const inlineUrl = cmd.match(/DATABASE_URL\s*=\s*['"]?(postgres(?:ql)?:\/\/[^\s'"]+)/i);
  if (mutatesSchema && inlineUrl) {
    const host = (inlineUrl[1].match(/@([^:/?]+)/) || [])[1] || '';
    const isLocal = /^(localhost|127\.0\.0\.1|::1|host\.docker\.internal|postgres)$/i.test(host);
    if (!isLocal) {
      block(
        `this points a schema-mutating Prisma command at the non-local host "${host}". ` +
          'Staging and production databases are migrated by the deploy pipeline, never from a dev machine.',
      );
    }
  }

  // ── Docker: volume deletion ───────────────────────────────────────────────
  // `-v`/`--volumes` on `down` deletes the named volumes: the Postgres data
  // directory AND uploads_data (every product image ever uploaded).
  if (/\bdocker\b[\s\S]*\bcompose\b[\s\S]*\bdown\b/i.test(cmd) && /(^|\s)(-v|--volumes)(\s|$)/i.test(cmd)) {
    block(
      '`docker compose down -v` deletes the named volumes — the Postgres data directory and uploads_data ' +
        '(every uploaded product image). Drop the `-v` to stop containers while keeping the data. ' +
        'The one-time staging wipe documented in docs/deploy.md is run by the owner on the server, not from here.',
    );
  }

  // ── Git: force-push to a shared branch ────────────────────────────────────
  if (/\bgit\s+push\b/i.test(cmd) && /(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/i.test(cmd)) {
    if (/\b(main|develop)\b/i.test(cmd)) {
      block(
        'force-pushing to `main`/`develop` rewrites history other clones (and the deploy pipeline) depend on.',
      );
    }
  }

  process.exit(0);
});
