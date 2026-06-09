---
description: Git help — explain commands, suggest next steps, answer questions
argument-hint: "[question]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Read
---

Delegate to the **git-helper** subagent (via the Agent tool). NEVER execute mutating git commands — only show and explain them.

Help with any git question or operation. The user may ask in Ukrainian or English: $ARGUMENTS

Common questions:

- 'Що робити далі?' — analyze git state + BACKLOG, suggest next GitFlow step
- 'Як створити гілку?' — read BACKLOG, suggest branch name + commands
- 'Як запушити зміни?' — show push commands with explanation
- 'Як злитись з develop?' — show merge commands step by step
- 'Як вирішити конфлікт?' — explain conflict resolution
- 'Коли потрібна нова гілка?' — explain GitFlow branching rules

Steps:

1. Run `git status` and `git branch` to understand current state.
2. If the question relates to a task, read `BACKLOG.md` for context.
3. Provide step-by-step answer with exact commands and explanations.
4. Use Ukrainian for explanations if the user writes in Ukrainian.
