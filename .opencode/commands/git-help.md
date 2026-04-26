Help with any git question or operation. The user may ask in Ukrainian or English.

Common questions:
- "Що робити далі?" — analyze git state + BACKLOG, suggest next GitFlow step
- "Як створити гілку для цієї задачі?" — read BACKLOG, suggest branch name + commands
- "Як запушити зміни?" — show push commands with explanation
- "Як злитись з develop?" — show merge/rebase commands step by step
- "Як вирішити конфлікт?" — explain conflict resolution process
- "Яка різниця між merge і rebase?" — explain with examples
- "Що таке conventional commits?" — explain the format with examples
- "Коли потрібна нова гілка?" — explain GitFlow branching rules

## Steps:

1. Run `git status` and `git branch` to understand current state.
2. If the question relates to a task, read `BACKLOG.md` for context.
3. Provide a clear, step-by-step answer with:
   - 📝 Exact commands to run (in code blocks, easy to copy)
   - 💡 Explanation of WHY each command is needed
   - ⚠️ Warnings about potential issues
4. Keep explanations simple — the user is learning git.
5. Use Ukrainian for explanations if the user writes in Ukrainian.

## Important:

- NEVER execute mutating git commands yourself — only show them.
- If the user asks something you're unsure about, say so and suggest checking the docs.
- Always consider the project's GitFlow conventions (main → develop → feature/*).
- Reference BACKLOG.md task numbers when suggesting branch names.