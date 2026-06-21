---
description: Generate a persistent implementation plan and update backlog
argument-hint: "<feature name>"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(ls:*), Bash(git diff:*), Bash(git log:*)
---

Generate a detailed implementation plan for: $ARGUMENTS

Delegate to the **task-planner** subagent (via the Agent tool) and use the **plan-document** skill.

Steps:

1. Read `docs/roadmap.md` to understand which phase this feature belongs to.
2. Read `BACKLOG.md` to find existing tasks and the next TASK number.
3. List files in `docs/plans/` to find the next sequential plan number.
4. Analyze the codebase for existing patterns.
5. Generate a structured plan using the **plan-document** skill template.
6. Save the plan to `docs/plans/[NNN]-[feature-name].md`.
7. Update `BACKLOG.md` with new tasks referencing the plan.

Do NOT modify any application code. This is planning only.
