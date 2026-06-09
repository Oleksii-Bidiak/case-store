---
description: Suggest the next task from the backlog
allowed-tools: Read, Grep, Glob
---

What should I work on next?

Delegate to the **task-planner** subagent (via the Agent tool).

1. Read `BACKLOG.md` to find the current project status.
2. Find the first task with status ⬜ (To Do) whose dependencies are all ✅ (Done).
3. If the task has a plan file referenced in the Plan column, read it for context.
4. Suggest the next task with a brief description of what needs to be done.
5. Ask if the user wants to start working on it.
