---
description: Request a code review from the code-reviewer agent
agent: code-reviewer
---

Review the current code changes for quality, security, and architecture compliance.

The code-reviewer agent will check:

1. **Security (OWASP Top 10)** — Injection, broken auth, sensitive data exposure, broken access control
2. **Clean Architecture (NestJS)** — Controller only routes, Service has logic, Repository encapsulates Prisma
3. **FSD (Next.js)** — Import direction is downward, no raw fetch calls, semantic tokens
4. **Testing** — Critical modules have tests, TDD approach for cart/discounts/inventory
5. **Code Quality** — No `any` types, no `console.log`, proper error handling

Current changes:

!`git diff --stat`

Use `@code-reviewer` directly for more control over the review scope.