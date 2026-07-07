-- TASK-261 — bootstrap the separate `umami` database inside the shared Postgres.
--
-- Scripts in /docker-entrypoint-initdb.d run ONLY on a brand-new, empty data
-- volume (the official postgres image never re-runs them once the cluster is
-- initialized). So this covers first-time setups and anyone who has run
-- `docker compose down -v`. Contributors with an already-populated volume must
-- create the database once by hand — see the fallback in docker-compose.yml.
CREATE DATABASE umami;
