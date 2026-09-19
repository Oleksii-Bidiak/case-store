#!/usr/bin/env bash
#
# disk-check.sh — "is the disk filling up?", run hourly from cron on the SERVER
# (TASK-454). See docs/deploy/06-day-to-day.md §1.3.
#
# A full disk is the most common way a cheap VPS dies, and the quietest: nothing
# warns, Postgres simply cannot write one more byte and the whole shop stops at
# once. This script turns "80 % used" into an alert hours or days before that.
#
# It reports to a healthchecks.io check, which does two jobs at once:
#   - `/fail` when usage is over the threshold → an alert (Telegram / e-mail);
#   - a success ping every hour otherwise → if the pings STOP (cron gone, server
#     dead), healthchecks.io alerts on the silence as well.
#
# ─── Usage ──────────────────────────────────────────────────────────────────
#   ./scripts/disk-check.sh
#
# ─── Configuration (environment; set on the crontab line) ───────────────────
#   DISK_PING_URL    optional   https://hc-ping.com/<uuid>. Unset → no pings; the
#                               script only prints and sets its exit code (cron
#                               e-mails the output if MAILTO is configured).
#   DISK_THRESHOLD   optional   percent used that counts as a problem, default 80
#   DISK_PATH        optional   filesystem to check, default / (Docker's data,
#                               the database and the uploads all live there)
#
# Exit: 0 — below the threshold; 1 — at or above it; 2 — could not measure or
# bad configuration. A failed ping never changes the exit code.

set -uo pipefail

DISK_PATH="${DISK_PATH:-/}"
DISK_THRESHOLD="${DISK_THRESHOLD:-80}"

ping_hc() { # $1 = suffix ("" | /fail), $2 = body
  [[ -n "${DISK_PING_URL:-}" ]] || return 0
  command -v curl >/dev/null 2>&1 || { echo "disk-check: WARNING — curl not found, ping skipped" >&2; return 0; }
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$2" "${DISK_PING_URL%/}$1" \
    || echo "disk-check: WARNING — healthchecks ping$1 failed" >&2
  return 0
}

fail_config() {
  echo "disk-check: ERROR — $*" >&2
  ping_hc /fail "disk-check: ERROR — $*"
  exit 2
}

# 10# — a value like "08" would otherwise be read as a (broken) octal number.
if ! [[ "$DISK_THRESHOLD" =~ ^[0-9]{1,2}$ ]] || ((10#$DISK_THRESHOLD < 1)); then
  fail_config "DISK_THRESHOLD must be a whole number 1..99, got '$DISK_THRESHOLD'"
fi
DISK_THRESHOLD=$((10#$DISK_THRESHOLD))

# --output=pcent asks GNU df for the "Use%" column alone. Picking a column out
# of the full table is fragile: a device or mount name with a space in it shifts
# every column after it, and the check would then compare the wrong number.
USED=$(df --output=pcent "$DISK_PATH" 2>/dev/null | tail -n 1 | tr -dc '0-9')
[[ "$USED" =~ ^[0-9]+$ ]] || fail_config "could not read usage of '$DISK_PATH' from df"

USED=$((10#$USED))
SUMMARY="disk $DISK_PATH at ${USED}% (threshold ${DISK_THRESHOLD}%)"

if ((USED >= DISK_THRESHOLD)); then
  echo "disk-check: WARNING — $SUMMARY. Free space: docs/deploy/06-day-to-day.md §2"
  ping_hc /fail "$SUMMARY"
  exit 1
fi

ping_hc "" "$SUMMARY"
exit 0
