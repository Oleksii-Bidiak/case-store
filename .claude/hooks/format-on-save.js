#!/usr/bin/env node
/**
 * PostToolUse hook (Edit|Write) — light auto-format.
 * For saved .ts/.tsx files, runs prettier --write on that single file.
 * ESLint is intentionally NOT run here: it duplicates the husky/lint-staged
 * pre-commit step and `eslint --fix` on every edit noticeably slows the flow.
 * Best-effort: never fails the edit flow (always exits 0).
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

  const filePath = payload?.tool_input?.file_path || '';
  if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

  const run = (label, command) => {
    try {
      execSync(command, { stdio: 'pipe' });
    } catch (e) {
      // Surface as non-blocking context; do not fail the hook.
      const msg = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
      console.error(`[format-on-save] ${label} reported issues:\n${msg.slice(0, 1000)}`);
    }
  };

  const quoted = JSON.stringify(filePath);
  run('prettier', `npx --no-install prettier --write ${quoted}`);

  process.exit(0);
});
