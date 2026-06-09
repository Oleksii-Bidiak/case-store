---
description: Code review with architecture and security focus
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Read, Grep, Glob
---

Delegate this review to the **code-reviewer** subagent (via the Agent tool). Read-only — do not modify any files.

Review the current changes for code quality, security, and architecture compliance.

1. Run `git diff` to see all uncommitted changes.
2. Analyze the changes for:
   - Clean Architecture violations (business logic in controllers, direct PrismaClient usage in services)
   - FSD import direction violations (importing from layers above)
   - Security issues (missing validation, exposed secrets, SQL injection risks)
   - Missing tests for critical business logic
   - Inconsistent API response format
   - Missing error handling
3. Provide a structured review with severity levels (CRITICAL, WARNING, SUGGESTION).
