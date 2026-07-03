---
name: plan-document
description: Generate structured implementation plan documents with task breakdowns, acceptance criteria, and file-level details. Persists plans as markdown files in docs/plans/ and updates BACKLOG.md.
---

## What I Do

I generate structured, persistent implementation plan documents that serve as the single source of truth for feature development. Plans are saved as markdown files in `docs/plans/` and task statuses are tracked in `BACKLOG.md`.

## When to Use Me

Use me when:

- Starting a new feature or module
- Breaking down a phase from `docs/roadmap.md`
- Needing a structured plan before implementation
- Onboarding a new developer who needs context

Use the `/plan` command or `@task-planner` agent to invoke me.

## Plan Document Template

Every plan file MUST follow this structure:

````markdown
# Plan: [Feature Name]

> **Status:** 🔄 In Progress | ✅ Complete | ⏸️ On Hold
> **Phase:** Phase N — [Phase Name]
> **Created:** YYYY-MM-DD
> **Last Updated:** YYYY-MM-DD

## Overview

Brief description of what this feature does and why it's needed.

## Scope

### In Scope

- [What this plan covers]

### Out of Scope

- [What is explicitly excluded]

## User Stories

1. As a [role], I want to [action], so that [benefit].
2. ...

## Technical Design

### Data Model

Prisma schema changes needed:

\```prisma
// Example schema additions
\```

### Backend (NestJS — Clean Architecture)

#### [ModuleName]Repository

- `findById(id: string): Promise<Entity | null>`
- `findMany(params): Promise<Entity[]>`
- `create(data: CreateDto): Promise<Entity>`
- ...

#### [ModuleName]Service

- `create(dto: CreateDto): Promise<Entity>` — Business rules...
- `calculateTotal(items, discount?): Promise<number>` — For cart calculations, ALWAYS use TDD
- ...

#### [ModuleName]Controller

- `POST /route` — Create
- `GET /route` — List
- `GET /route/:id` — Get by ID
- `PUT /route/:id` — Update
- `DELETE /route/:id` — Delete

### Frontend (Next.js — FSD)

#### shared/ui

- No new base components needed / List any needed

#### entities

- `useGet[Entity]` — Orval-generated hook
- `useGet[Entity]List` — Orval-generated hook

#### features

- `[FeatureName]` — Business interaction component (e.g., AddToCart)

#### widgets

- `[WidgetName]` — Composite block (e.g., ProductCard>

#### app (pages)

- `app/(route-group)/page.tsx` — Page component

### API Contract

Key endpoints with request/response shapes:

| Method | Path   | Request Body | Response                 |
| ------ | ------ | ------------ | ------------------------ |
| POST   | /route | CreateDto    | { data: Entity }         |
| GET    | /route | —            | { data: Entity[], meta } |
| ...    | ...    | ...          | ...                      |

## Tasks

### TASK-[XXX]: [Title]

**Type:** feat | fix | refactor | test | docs
**Scope:** store-api | store-client | store-admin | shared
**Complexity:** S | M | L
**TDD Required:** Yes | No
**Depends on:** TASK-[XXX]

**Acceptance Criteria:**

- [ ] Criterion 1
- [ ] Criterion 2

**Files to create/modify:**

- `path/to/file.ts` — purpose

---

(Repeat for each task)

## Migration Steps

1. First, create the Prisma migration
2. Then, implement the repository
3. Then, implement the service (with TDD if critical)
4. ...

## Risks & Mitigations

| Risk               | Mitigation         |
| ------------------ | ------------------ |
| [Risk description] | [How to handle it] |

## Notes

Additional context, edge cases, or decisions made.
````

## File Naming Convention

Plan files are named with a sequential number and kebab-case feature name:

```
docs/plans/001-cart.md
docs/plans/002-checkout.md
docs/plans/003-order-management.md
docs/plans/004-admin-products.md
```

To determine the next number, check the existing files in `docs/plans/` and increment.

## BACKLOG.md Integration

After creating a plan document, you MUST update `BACKLOG.md`:

1. Find the relevant phase section
2. Update task descriptions if they're more detailed now
3. Add the plan file path to the "Plan" column
4. Mark the first task as 🔄 (In Progress) if starting immediately

## Status Updates

When starting to implement a task from the plan:

- Update `BACKLOG.md`: change the task status from ⬜ to 🔄
- Update the plan file: add "Started: YYYY-MM-DD" to the task

When completing a task:

- Update `BACKLOG.md`: change the task status from 🔄 to ✅
- Update the plan file: add "Completed: YYYY-MM-DD" to the task

## Rules

- ALWAYS write plans in English
- ALWAYS save plans to `docs/plans/` directory
- ALWAYS update `BACKLOG.md` when creating or updating a plan
- ALWAYS reference the roadmap phase in the plan header
- ALWAYS include acceptance criteria for every task
- ALWAYS mark TDD-required tasks clearly (cart, discounts, inventory, auth)
- NEVER modify code when creating a plan — plans are read-only documents
- NEVER delete plan files — they serve as project history
