-- Create the separate `umami` analytics database inside the shared Postgres
-- (TASK-270 prod compose; mirrors TASK-261's dev `docker/postgres-init` script).
--
-- The official Postgres image only runs the scripts in
-- /docker-entrypoint-initdb.d ONCE, on a brand-new (empty) data volume. So this
-- auto-creates the `umami` DB on a fresh `postgres_prod_data` volume only.
-- For an already-initialised volume, create it manually one time:
--   docker compose -f docker-compose.prod.yml exec postgres \
--     psql -U "$POSTGRES_USER" -c "CREATE DATABASE umami"
CREATE DATABASE umami;
