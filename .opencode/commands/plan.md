---
description: Generate a structured implementation plan and save it to docs/plans/ with task breakdown and acceptance criteria
agent: task-planner
---

Generate a detailed implementation plan for: $ARGUMENTS

## Steps

1. **Check the roadmap** — Read `docs/roadmap.md` to understand which phase this feature belongs to.

2. **Check the backlog** — Read `BACKLOG.md` to find existing related tasks and the next available TASK number.

3. **Check existing plans** — List files in `docs/plans/` to find the next sequential plan number (e.g., if 001-cart.md exists, use 002).

4. **Analyze the codebase** — Read relevant existing files to understand current patterns:
   - `apps/store-api/prisma/schema.prisma` — current data model
   - `apps/store-api/src/` — existing modules for pattern reference
   - `apps/store-client/src/` — existing FSD structure
   - `apps/store-admin/src/` — existing admin structure

5. **Generate the plan** — Use the @plan-document skill template to create a structured plan document with:
   - Overview and scope
   - User stories
   - Technical design (data model, backend, frontend, API contract)
   - Task breakdown with acceptance criteria
   - Migration steps
   - Risks and mitigations

6. **Save the plan** — Write the plan to `docs/plans/[NNN]-[feature-name].md`

7. **Update BACKLOG.md** — Add or update tasks in the relevant phase section:
   - Set task descriptions to match the plan
   - Add the plan file path to the "Plan" column
   - Keep tasks as ⬜ (To Do) — don't mark as 🔄 until implementation starts

Use the @plan-document skill for the document template.