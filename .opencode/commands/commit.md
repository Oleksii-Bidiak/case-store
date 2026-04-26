Analyze current changes and suggest a conventional commit message.

1. Run `git status` to see which files changed.
2. Run `git diff --stat` to see a summary of changes.
3. Run `git diff` to see the actual changes (if too large, focus on key files).
4. Analyze what was changed and why.

Based on the analysis, suggest a commit message following conventional format:

```
type(scope): description
```

Explain:
- **Why this type** (feat/fix/refactor/test/docs/chore/ci/style)
- **Why this scope** (which module/feature is affected)
- **Why this description** (what the change does in imperative mood)

Show the exact commands to run:

```
git add <specific-files-or-.>
git commit -m "type(scope): description"
```

## If the user says "WIP" or "проміжний" or "intermediate":

Suggest a WIP commit with a note about what's still pending:

```
feat(scope): WIP short description — what's done, what's pending
```

Example WIP commits:
- `feat(auth): WIP refresh token rotation — service done, controller pending`
- `feat(cart): WIP cart calculations — totals work, discounts not yet`
- `feat(product): WIP product listing — API done, frontend pending`

Remind the user that WIP commits should be squashed or amended before merging to develop.

## If changes span multiple types/scopes:

Suggest splitting into multiple commits, one per logical change. Show the commands for each.

## Important:

- NEVER run git add or git commit yourself — only suggest commands.
- ALWAYS explain the reasoning behind the type, scope, and description.
- If the user is on `main` branch, warn them — commits should go on feature/fix branches.