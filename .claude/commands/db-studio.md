---
description: Open Prisma Studio database browser
allowed-tools: Bash(docker compose:*), Bash(npm run db:*), Bash(npx prisma:*)
---

Open Prisma Studio to visually browse and edit database data.

1. Ensure Docker containers are running: `docker compose up -d`
2. Run `npm run db:studio` (root proxy)
3. Prisma Studio will open in the browser at http://localhost:5555
4. Report the URL and any connection issues.

Note: Prisma Studio is for development use only. Never use it in production.
