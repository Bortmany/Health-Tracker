# Cut

A fat-loss and training tracker for people who aren't sure what to train — and for the coaches who train them. React + Vite frontend, Express + Postgres backend, npm workspaces monorepo. Installable on phones as a PWA.

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

1. Copy `.env.example` to `.env`, set `DATABASE_URL` and `JWT_SECRET`.
2. `npm install`
3. `npm run migrate`
4. `npm run dev` (API on :3001, web on :5173)

Tests: `npm test` (integration tests against the local Postgres). Build check: `npm run build`.

## Deploying (Render)

`render.yaml` is a Render Blueprint: New → Blueprint → pick this repo → Apply. It creates the web service and the Postgres database, generates `JWT_SECRET`, and runs migrations on every deploy. Deploys happen automatically on push to `main`.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Signs login cookies |
| `DATABASE_SSL` | Hosted DBs | `true` on Render and most hosted Postgres |
| `NODE_ENV` | Yes | `production` makes Express serve the built frontend |
| `PORT`, `CORS_ORIGIN` | No | Defaults fine locally |
| `ANTHROPIC_API_KEY` | Optional switch | Wakes the AI plan writer (personalized plans written by Claude instead of picked from the library) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_ID` + `APP_URL` | Optional switch | Wakes paid Premium upgrades (Stripe Checkout + webhook). Until set, the upgrade button shows "coming soon" and Premium can be granted manually: `UPDATE users SET plan_tier = 'premium' WHERE email = '...';` |

## Repo structure

```
/apps
  /api    Express app (routes, db/migrations, middleware, lib)
  /web    React app (pages, components, api wrappers, hooks)
/docs
  schema.sql   always-current full schema dump
  mobile.md    how to publish native iPhone/Android apps
(project helper agents — code review, verification, builders — live in the central Agents repo)
```

## Migrations

Plain numbered SQL files in `apps/api/src/db/migrations/`, applied in order by `apps/api/src/db/migrate.js`, tracked in `schema_migrations`. Run with `npm run migrate`.
