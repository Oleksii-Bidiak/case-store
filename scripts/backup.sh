#!/usr/bin/env bash
#
# backup.sh — encrypted, off-site backup of everything that cannot be rebuilt
# from git (TASK-308). Run on the SERVER, from /opt/store-ai.
#
# Two things are irreplaceable, and both are backed up here:
#
#   1. The Postgres database — orders, customers, products, content.
#   2. The `uploads` volume — every product image ever uploaded. These live on
#      the server's disk, NOT in the database and NOT in git. A backup that
#      covers only the database restores a shop whose every photo is a broken
#      link. It is the easiest thing in the world to forget, and you only find
#      out when you need it.
#
# The database dump uses pg_dump's custom format (-Fc), not plain SQL, on
# purpose: it lets `pg_restore -t <table>` pull back ONE table without touching
# the rest. That is exactly the "someone deleted the admin account" case — the
# alternative, replaying a whole SQL dump over a live database, would throw away
# every order placed since the dump was taken.
#
# Every archive is encrypted with `age` to a PUBLIC key. The matching private key
# must NEVER be on the server: with it, anyone who gets root also gets every
# historical backup — including the customer data in them. Keep it in your
# password manager. The server can create backups it cannot itself read.
#
# ─── Usage ──────────────────────────────────────────────────────────────────
#   ./scripts/backup.sh              # database + uploads
#   ./scripts/backup.sh --db-only    # database only (used before a deploy)
#
# ─── Configuration (from .env.production, or the environment) ───────────────
#   AGE_PUBLIC_KEY    required   age1... — the PUBLIC half. Never the private one.
#   RCLONE_REMOTE     optional   e.g. b2:store-ai-backups — off-site copy target.
#                                Without it backups stay on the server, which is
#                                no protection against losing the server.
#   BACKUP_DIR        optional   default /opt/store-ai/backups
#   BACKUP_KEEP_DAYS  optional   default 7 (local only; set the long retention as
#                                a lifecycle rule on the remote bucket)
#   COMPOSE_FILES     optional   default "-f docker-compose.prod.yml"
#
# Exits non-zero on ANY failure — the deploy pipeline depends on that to refuse
# to migrate a database it has no fresh backup of.

set -euo pipefail

cd "$(dirname "$0")/.."

DB_ONLY=false
[[ "${1:-}" == "--db-only" ]] && DB_ONLY=true

# ─── Config ─────────────────────────────────────────────────────────────────
ENV_FILE="${ENV_FILE:-.env.production}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
COMPOSE_FILES="${COMPOSE_FILES:--f docker-compose.prod.yml}"
# shellcheck disable=SC2086
COMPOSE="docker compose $COMPOSE_FILES --env-file $ENV_FILE"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

die() { echo "backup: FAILED — $*" >&2; exit 1; }
log() { echo "backup: $*"; }

# ─── Preflight ──────────────────────────────────────────────────────────────
# Check everything BEFORE producing anything. A backup script that half-works is
# worse than one that refuses to start: it leaves a file that looks like a backup.
command -v age >/dev/null 2>&1 || die "\`age\` is not installed (apt install age)"
[[ -n "${AGE_PUBLIC_KEY:-}" ]] || die "AGE_PUBLIC_KEY is not set — see docs/backup-restore.md"
[[ "$AGE_PUBLIC_KEY" == age1* ]] || die "AGE_PUBLIC_KEY must be the PUBLIC key (age1...), not the private one"
[[ -n "${POSTGRES_USER:-}" && -n "${POSTGRES_DB:-}" ]] || die "POSTGRES_USER / POSTGRES_DB are not set"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null 2>&1 || die "RCLONE_REMOTE is set but \`rclone\` is not installed"
fi

mkdir -p "$BACKUP_DIR"

# ─── Database ───────────────────────────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"

log "dumping database '$POSTGRES_DB'…"
$COMPOSE exec -T postgres pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --compress=9 \
  > "$DB_FILE" || die "pg_dump failed"

[[ -s "$DB_FILE" ]] || die "the dump is empty"

# Prove the dump is READABLE, not merely non-empty. A truncated or corrupt file
# still has a size; `pg_restore --list` has to parse the archive's table of
# contents to succeed, so it fails on exactly the files that would betray you at
# 3am. This is the difference between having a backup and believing you do.
log "verifying the dump can be read back…"
$COMPOSE exec -T postgres pg_restore --list /dev/stdin < "$DB_FILE" > /dev/null \
  || die "the dump is unreadable — pg_restore could not parse it. NOT a usable backup."

TABLES=$($COMPOSE exec -T postgres pg_restore --list /dev/stdin < "$DB_FILE" | grep -c "TABLE DATA" || true)
log "  ok — $TABLES tables with data"

age -r "$AGE_PUBLIC_KEY" -o "$DB_FILE.age" "$DB_FILE" || die "encryption failed"
rm -f "$DB_FILE"
log "  encrypted → $(basename "$DB_FILE.age") ($(du -h "$DB_FILE.age" | cut -f1))"

ARTIFACTS=("$DB_FILE.age")

# ─── Uploads ────────────────────────────────────────────────────────────────
if [[ "$DB_ONLY" == false ]]; then
  UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"

  # Streamed out of the running container rather than read from the named volume
  # directly: the volume's real name depends on the compose project prefix, and
  # guessing it wrong would silently back up nothing at all.
  log "archiving uploaded images…"
  $COMPOSE exec -T store-api tar czf - -C /app/apps/store-api/uploads . \
    > "$UP_FILE" || die "tar of the uploads volume failed"

  [[ -s "$UP_FILE" ]] || die "the uploads archive is empty"

  FILES=$(tar tzf "$UP_FILE" | grep -cv '/$' || true)
  log "  ok — $FILES file(s)"

  age -r "$AGE_PUBLIC_KEY" -o "$UP_FILE.age" "$UP_FILE" || die "encryption failed"
  rm -f "$UP_FILE"
  log "  encrypted → $(basename "$UP_FILE.age") ($(du -h "$UP_FILE.age" | cut -f1))"

  ARTIFACTS+=("$UP_FILE.age")
fi

# ─── Off-site copy ──────────────────────────────────────────────────────────
# A backup that only exists on the machine it is backing up protects against
# exactly one failure mode (a bad migration) and none of the others: a dead disk,
# a deleted VPS, a ransomed host. Off-site is the whole point.
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "uploading to $RCLONE_REMOTE…"
  for f in "${ARTIFACTS[@]}"; do
    rclone copy "$f" "$RCLONE_REMOTE" || die "upload of $(basename "$f") failed"
  done
  log "  ok"
else
  log "WARNING: RCLONE_REMOTE is not set — backups exist ONLY on this server."
  log "         That is no protection against losing the server itself."
fi

# ─── Prune local copies ─────────────────────────────────────────────────────
# Local retention is a short buffer only. Long-term retention belongs to a
# lifecycle rule on the bucket, where a compromised server cannot delete it.
find "$BACKUP_DIR" -name '*.age' -mtime "+$BACKUP_KEEP_DAYS" -delete 2>/dev/null || true

log "done — $STAMP"
