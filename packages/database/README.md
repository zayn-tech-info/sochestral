# @sochestral/database

Product Postgres schema for SaaS users and review drafts. SocialMCP keeps tokens, posts, schedules, and publish logs in its own database.

## Local Docker Postgres

Host port **5433** (avoids clashing with a system Postgres on 5432):

```bash
docker run -d \
  --name sochestral-postgres \
  -e POSTGRES_USER=sochestral \
  -e POSTGRES_PASSWORD=sochestral \
  -e POSTGRES_DB=sochestral \
  -p 5433:5432 \
  postgres:16
```

Connection string (also in root `.env.example`):

```
DATABASE_URL=postgresql://sochestral:sochestral@localhost:5433/sochestral
TEST_DATABASE_URL=postgresql://sochestral:sochestral@localhost:5433/sochestral_test
```

Copy `.env.example` to `.env` at the repo root before migrate or provision.

Database tests clear their tables. They require a separate
`TEST_DATABASE_URL` whose database name contains `test`. The test URL must not
target the database used by `DATABASE_URL`.

## Commands

From the repo root (after `pnpm install`):

```bash
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations (fails fast if DATABASE_URL is missing)
pnpm db:provision [email]   # create a user; prints JSON { id, email, createdAt }
pnpm test:database  # package tests (needs a migrated TEST_DATABASE_URL)
```

Email for provision: positional arg wins over `PROVISION_EMAIL`. Blank or absent becomes `email: null`.
