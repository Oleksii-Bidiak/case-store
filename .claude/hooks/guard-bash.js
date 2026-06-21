#!/usr/bin/env node
/**
 * PreToolUse hook (Bash) — GitFlow + secrets guardrails.
 * Blocks:
 *   - `git commit` / `git push` while the current branch is `main`
 *   - printing .env files (cat/type/Get-Content .env...) to avoid leaking secrets
 * Exit code 2 + stderr blocks the tool call and tells Claude why.
 */
const { execSync } = require('child_process');

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

  // Block printing/reading .env secrets via any common reader (cat/grep/head/less/awk/…),
  // including piped forms like `cat .env | grep X` or `grep KEY .env`.
  // Safe sample variants (.env.example/.sample/.template/.dist) are allowed.
  const withoutSafeEnv = cmd.replace(
    /\.env\.(example|sample|template|dist)\b/gi,
    ''
  );
  const mentionsRealEnv = /\.env(\b|\.)/i.test(withoutSafeEnv);
  const usesFileReader =
    /\b(cat|type|Get-Content|gc|less|more|head|tail|tac|nl|od|xxd|hexdump|strings|grep|egrep|rg|awk|sed|printf)\b/i.test(
      cmd
    ) || /(^|[\s;&|])\.\s+\S*\.env/i.test(cmd); // POSIX `.`/source builtin
  if (mentionsRealEnv && usesFileReader) {
    console.error(
      'Blocked: do not print/read .env files — they contain secrets. Use .env.example instead.'
    );
    process.exit(2);
  }

  // Block commits/pushes on the main branch
  const isCommitOrPush = /\bgit\s+(commit|push)\b/.test(cmd);
  if (isCommitOrPush) {
    let branch = '';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
      }).trim();
    } catch {
      process.exit(0); // not a git repo — let it through
    }
    let onMain = branch === 'main';
    // Detached HEAD sitting on the same commit as `main` is effectively committing to main.
    if (!onMain && branch === 'HEAD') {
      try {
        const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        const main = execSync('git rev-parse main', { encoding: 'utf8' }).trim();
        if (head && head === main) onMain = true;
      } catch {
        /* `main` not present locally — nothing to compare, allow */
      }
    }
    if (onMain) {
      console.error(
        'Blocked: you are on `main`. Per GitFlow, commit/push on a feature/fix branch ' +
          'and merge into `develop` via PR. Create one: `git checkout -b feature/NNN-name`.'
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
