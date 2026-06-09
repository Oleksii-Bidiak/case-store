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

  // Block printing .env secrets
  if (/\b(cat|type|Get-Content|gc)\b[^|;&]*\.env(\b|\.)/i.test(cmd)) {
    console.error(
      'Blocked: do not print .env files — they contain secrets. Read .env.example instead.'
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
      process.exit(0); // not a git repo / detached — let it through
    }
    if (branch === 'main') {
      console.error(
        'Blocked: you are on `main`. Per GitFlow, commit/push on a feature/fix branch ' +
          'and merge into `develop` via PR. Create one: `git checkout -b feature/NNN-name`.'
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
