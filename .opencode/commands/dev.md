Start development servers for the monorepo workspaces.

1. Check which workspaces exist by listing `apps/` directory.
2. Start Docker containers if not running: `docker compose up -d`
3. Start the backend dev server: `npm run start:dev -w apps/store-api` (or equivalent)
4. Start the storefront dev server: `npm run dev -w apps/store-client`
5. Start the admin dev server: `npm run dev -w apps/store-admin`
6. Report which servers are running and on which ports.

If a workspace doesn't exist yet, skip it and note that it needs to be scaffolded first.