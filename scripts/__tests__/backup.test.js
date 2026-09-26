// Tests for scripts/backup.sh (TASK-738).
//
// Run: node --test scripts/__tests__/backup.test.js
//
// backup.sh is exercised for real, through bash, with two executables faked
// first on PATH:
//
//   docker — emulates the three `docker compose … exec -T <svc> <cmd>` calls the
//            script makes: `pg_dump` (prints a fake dump), `pg_restore --list`
//            (swallows stdin, prints a table of contents) and `tar czf -` of the
//            uploads volume. What the tar call emits is chosen by STUB_UPLOADS:
//              valid     — a real gzip tar of a temp directory with files in it
//              empty     — a real gzip tar of an empty directory (a fresh shop)
//              garbage   — bytes that are not gzip at all
//              truncated — the first half of a real gzip tar
//   age    — `age -r KEY -o OUT IN` just copies IN to OUT.
//
// The point is the uploads integrity check: before TASK-738 the file count was
// `tar tzf … | grep -cv '/$' || true`, so an unreadable archive was reported as
// "ok — 0 file(s)" and the backup exited 0 — a nightly job reporting success
// while producing nothing restorable.
//
// On Windows this needs Git Bash (not WSL's System32 bash); without any bash
// the tests are skipped with a message rather than failing.

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];
  try {
    // .../Git/mingw64/libexec/git-core → .../Git/bin/bash.exe
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    candidates.push(path.resolve(exec, '..', '..', '..', 'bin', 'bash.exe'));
  } catch {
    /* git not on PATH — fall through */
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const found = execFileSync('where', ['bash'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      // System32\bash.exe is WSL: a different filesystem, not what we want.
      .filter((s) => s && !/\\System32\\/i.test(s));
    if (found.length) return found[0];
  } catch {
    /* no bash on PATH */
  }
  return null;
}

const BASH = findBash();
const skip = BASH ? false : 'no bash found (on Windows install Git for Windows) — backup.sh not exercised';

// Written with explicit \n: a CRLF shebang line is not executable under bash.
const DOCKER_STUB = `#!/usr/bin/env bash
# Fake \`docker\` for backup.test.js — see the header there.
set -euo pipefail
args=" $* "
case "$args" in
  *" pg_dump "*)
    printf 'PGDMP fake custom-format dump\\n'
    ;;
  *" pg_restore "*)
    cat > /dev/null
    printf '; Archive created by a stub\\n'
    printf '3001; 0 16384 TABLE DATA public users stub\\n'
    printf '3002; 0 16390 TABLE DATA public products stub\\n'
    ;;
  *" tar czf "*)
    case "\${STUB_UPLOADS:-valid}" in
      valid)
        tar czf - -C "$STUB_UPLOADS_SRC" .
        ;;
      empty)
        tmp="$(mktemp -d)"
        tar czf - -C "$tmp" .
        rmdir "$tmp"
        ;;
      garbage)
        printf 'this is not a gzip archive, it only has a size\\n'
        ;;
      truncated)
        tmp="$(mktemp)"
        tar czf "$tmp" -C "$STUB_UPLOADS_SRC" .
        size=$(wc -c < "$tmp")
        head -c $((size / 2)) "$tmp"
        rm -f "$tmp"
        ;;
      *)
        echo "docker stub: unknown STUB_UPLOADS=$STUB_UPLOADS" >&2
        exit 2
        ;;
    esac
    ;;
  *)
    echo "docker stub: unexpected call: $*" >&2
    exit 2
    ;;
esac
`;

const AGE_STUB = `#!/usr/bin/env bash
# Fake \`age\` for backup.test.js: age -r KEY -o OUT IN → copy IN to OUT.
set -euo pipefail
out=""; in=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -r) shift 2 ;;
    -o) out="$2"; shift 2 ;;
    *) in="$1"; shift ;;
  esac
done
cp "$in" "$out"
`;

// Runs inside bash: converts the Windows paths handed over by Node into POSIX
// ones (GNU tar reads "C:/…" as host "C" and tries rsh), puts the stubs first
// on PATH and execs the real script. On Linux cygpath is absent and the paths
// are already POSIX.
const WRAPPER = [
  'set -e',
  'p() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf %s "$1"; fi; }',
  'export STUB_BIN="$(p "$STUB_BIN")" STUB_UPLOADS_SRC="$(p "$STUB_UPLOADS_SRC")"',
  'export ENV_FILE="$(p "$ENV_FILE")" BACKUP_DIR="$(p "$BACKUP_DIR")" TMPDIR="$(p "$TMPDIR")"',
  'export PATH="$STUB_BIN:$PATH"',
  'exec bash scripts/backup.sh "$@"',
].join('\n');

let root;

before(() => {
  if (skip) return;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), DOCKER_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'age'), AGE_STUB, { mode: 0o755 });

  const uploads = path.join(root, 'uploads-src');
  fs.mkdirSync(path.join(uploads, 'products'), { recursive: true });
  // Enough varied bytes that half of the gzip stream is a real mid-stream cut.
  for (let i = 0; i < 3; i += 1) {
    const body = Array.from({ length: 400 }, (_, j) => `${i}-${j}-${(i * 7919 + j * 104729) % 9973}`).join(',');
    fs.writeFileSync(path.join(uploads, 'products', `img-${i}.webp`), body);
  }

  // The env file the script sources — named without the usual dot-prefix on
  // purpose; the script takes any path.
  fs.writeFileSync(
    path.join(root, 'backup-config'),
    ['AGE_PUBLIC_KEY=age1stubpublickeyfortestsonly', 'POSTGRES_USER=store', 'POSTGRES_DB=store_prod', ''].join('\n'),
  );
});

after(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function runBackup(mode, args = []) {
  const backupDir = path.join(root, `backups-${mode}`);
  const tmpDir = path.join(root, `tmp-${mode}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const env = {
    ...process.env,
    STUB_BIN: path.join(root, 'bin'),
    STUB_UPLOADS: mode,
    STUB_UPLOADS_SRC: path.join(root, 'uploads-src'),
    ENV_FILE: path.join(root, 'backup-config'),
    BACKUP_DIR: backupDir,
    TMPDIR: tmpDir,
    // Never ping or upload anything from a test run.
    BACKUP_PING_URL: '',
    RCLONE_REMOTE: '',
  };
  const res = spawnSync(BASH, ['-c', WRAPPER, 'backup-wrapper', ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { ...res, backupDir, tmpDir, output: `${res.stdout}\n${res.stderr}` };
}

function listDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

test('a readable uploads archive: exits 0 and counts the files in it', { skip }, () => {
  const r = runBackup('valid');
  assert.equal(r.status, 0, r.output);
  const m = r.output.match(/ok — (\d+) file\(s\)/);
  assert.ok(m, `no "ok — N file(s)" line:\n${r.output}`);
  assert.ok(Number(m[1]) > 0, `expected N > 0:\n${r.output}`);
  const files = listDir(r.backupDir);
  assert.ok(files.some((f) => /^db-.*\.dump\.age$/.test(f)), `no db .age in ${files}`);
  assert.ok(files.some((f) => /^uploads-.*\.tar\.gz\.age$/.test(f)), `no uploads .age in ${files}`);
  assert.deepEqual(listDir(r.tmpDir), [], 'plaintext work dir left behind');
});

// The other side of the integrity check: a shop with no uploads yet produces a
// readable archive with nothing in it, and that must stay a successful backup.
test('an empty but readable uploads archive: exits 0 with 0 files', { skip }, () => {
  const r = runBackup('empty');
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /ok — 0 file\(s\)/);
  assert.ok(
    listDir(r.backupDir).some((f) => /^uploads-.*\.tar\.gz\.age$/.test(f)),
    'no uploads .age for an empty archive',
  );
  assert.deepEqual(listDir(r.tmpDir), [], 'plaintext work dir left behind');
});

for (const mode of ['garbage', 'truncated']) {
  test(`a ${mode} uploads archive: the backup fails loudly`, { skip }, () => {
    const r = runBackup(mode);
    assert.notEqual(r.status, 0, `backup reported success on a ${mode} archive:\n${r.output}`);
    assert.match(r.output, /the uploads archive is unreadable/);
    assert.doesNotMatch(r.output, /ok — \d+ file\(s\)/);
    assert.ok(
      !listDir(r.backupDir).some((f) => f.startsWith('uploads-')),
      'an uploads artefact was written for an unreadable archive',
    );
    assert.deepEqual(listDir(r.tmpDir), [], 'plaintext work dir left behind');
  });
}

test('--db-only never touches the uploads volume', { skip }, () => {
  // `garbage` would fail the run if the uploads step executed at all.
  const r = runBackup('garbage', ['--db-only']);
  assert.equal(r.status, 0, r.output);
  assert.doesNotMatch(r.output, /archiving uploaded images/);
});
