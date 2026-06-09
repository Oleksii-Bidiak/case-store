---
description: Suggest conventional commit message for current changes
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Read
---

Delegate to the **git-helper** subagent (via the Agent tool). NEVER run `git add` or `git commit` — only suggest the commands.

Analyze current changes and suggest a conventional commit message.

1. Run `git status` to see which files changed.
2. Run `git diff --stat` to see a summary of changes.
3. Run `git diff` to see the actual changes (if too large, focus on key files).
4. Analyze what was changed and suggest a commit message in conventional format: `type(scope): description`
5. Explain WHY this type, WHY this scope, WHY this description.
6. Show the exact commands to run (git add + git commit).

If the user says 'WIP' or 'проміжний' or 'intermediate':
Suggest a WIP commit: `feat(scope): WIP short description — what's done, what's pending`
Remind that WIP commits should be squashed before merging to develop.

If the user is on the `main` branch, warn them — commits should go on feature/fix branches.
