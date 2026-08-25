# Cut

A fat-loss and training tracker for people who aren't sure what to train — and for the coaches who train them.

**Stack:** Express + raw `pg` (no ORM — hand-written SQL, numbered migration files) on the backend, React + Vite (PWA, installable on phones) on the frontend, npm workspaces monorepo, deployed on Railway. Tests run on Vitest against a real local Postgres database (no mocking of the DB).

## What it does

**For regular users**
- A short quiz (age, experience, goal, equipment, days per week) matches you to one of 14 professionally structured workout plans — calisthenics, powerlifting, muscle building, cardio, general fitness, including an over-50 joint-friendly plan.
- The app tells you what week of your plan you're on, in plain English, with easy (deload) weeks scheduled where they belong. Free accounts get 4-week plans; Premium unlocks the 52-week periodized versions.
- Daily log: weight, waist, sleep, HRV, recovery, strain, steps, habits, activities, injury check-ins, and food (calories, macros, meals).
- Training log with rest timer, exercise autocomplete backed by a 50-exercise guide with form cues, personal-record tracking, and per-exercise "last time" hints.
- Dashboard with weight trend chart, weekly habit ring, and logging streak; Progress page with charts and personal records.

**For coaches**
- Sign up as a coach, generate invite codes, and connect clients (a client entering your code is their consent).
- See each client's weight trend and recent sessions; assign and edit workout programs directly in their account (tagged "From your coach" on their side).

**For phones**
- Installable from the browser (Add to Home Screen) with its own icon.
- `POST /api/health-sync` is ready to receive Apple Health / Health Connect batches from future native apps — device data fills blanks but never overwrites manual entries. See `docs/mobile.md` for the App Store / Play Store path.

## Local development

1. Make sure Postgres is running (`service postgresql start` in a sandbox; on a normal machine, whatever starts your local Postgres) and create a database for the app — the connection string below assumes a database named `cut`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL` (point it at the database from step 1) and `JWT_SECRET` (32+ characters — the app refuses to start otherwise).
3. `npm install` — installs both workspaces (`apps/api`, `apps/web`) from the root.
4. `npm run migrate` (equivalent to `npm run migrate -w apps/api`) — applies every SQL file in `apps/api/src/db/migrations/` in order, tracked in a `schema_migrations` table so it's safe to re-run.
5. `npm run dev` — runs the API (`:3001`) and the web app (`:5173`) together.

### Tests

`npm test` runs the backend integration test suite (`apps/api`) with [Vitest](https://vitest.dev), against the real local Postgres database — nothing is mocked. Each test file creates and cleans up its own timestamped user(s), and files run one at a time (not in parallel) because they share one database. The npm script sets `DISABLE_RATE_LIMIT=true` so the suite isn't throttled by the login rate limiter — never set that variable in dev, staging, or production. 19 test files, 123 tests, all currently green.

Build check: `npm run build` (builds the web app with Vite).

## Deploying (Railway)

`railway.json` is the deploy config: create a Railway project from this repo, attach a Postgres plugin (sets `DATABASE_URL`), and set the environment variables below. Railway builds with NIXPACKS (`npm install --include=dev && npm run build`), runs the database migrations before each deploy (`preDeployCommand: npm run migrate -w apps/api`), starts the API (`npm start -w apps/api`, which also serves the already-built web app when `NODE_ENV=production`), and health-checks `GET /api/health`. Deploys happen automatically on push to `main`.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Signs login cookies |
| `DATABASE_SSL` | Hosted DBs | `true` on Railway and most hosted Postgres |
| `NODE_ENV` | Yes | `production` makes Express serve the built frontend |
| `PORT`, `CORS_ORIGIN` | No | Defaults fine locally |
| `ANTHROPIC_API_KEY` | Optional switch | Wakes the AI plan writer (personalized plans written by Claude instead of picked from the library) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_ID` + `APP_URL` | Optional switch | Wakes paid Premium upgrades (Stripe Checkout + webhook). Until set, the upgrade button shows "coming soon" and Premium can be granted manually: `UPDATE users SET plan_tier = 'premium' WHERE email = '...';` |

## Repo structure

```
/apps
  /api    Express app (routes, db/migrations, middleware, lib, *.test.js)
  /web    React app (pages, components, api wrappers, hooks)
/docs
  schema.sql   always-current full schema dump
  mobile.md    how to publish native iPhone/Android apps
railway.json   Railway deploy config (build, pre-deploy migrate, start, health check)
.env.example   every environment variable the app reads, with comments
```

## Migrations

Plain numbered SQL files in `apps/api/src/db/migrations/`, applied in order by `apps/api/src/db/migrate.js`, tracked in `schema_migrations`. Run with `npm run migrate`.
