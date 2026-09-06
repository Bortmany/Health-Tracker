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

## Deploying (Railway)

`railway.json` is the deploy config: create a Railway project from this repo, attach a Postgres plugin (sets `DATABASE_URL`), and set the environment variables below. Railway builds with NIXPACKS, runs the database migrations before each deploy (`preDeployCommand`), starts the API, and health-checks `/api/health`. Deploys happen automatically on push to `main`.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Signs login cookies |
| `DATABASE_SSL` | Hosted DBs | `true` on Railway and most hosted Postgres |
| `NODE_ENV` | Yes | `production` makes Express serve the built frontend |
| `TRUSTED_PROXY` | Yes on Railway | Set to `1` (the number of proxy hops in front of the app). Railway puts a proxy in front of every request, so without this every visitor looks like the same address and the login/save rate limits lock everyone out at once. Leave unset locally. |
| `PORT`, `CORS_ORIGIN` | No | Defaults fine locally. `CORS_ORIGIN` falls back to `APP_URL` when that is set, then to the local dev address. |
| `SIGNUP_INVITE_CODES` | Yes in production (until the paywall is live) | Comma-separated signup invite codes, 8+ characters each. When set, creating an account requires one of them (invitation-only). Rotate by editing the variable and redeploying. Not the same as coach invite codes. |
| `SIGNUPS_OPEN` | No | `true` lets anyone sign up without a code. In production with neither this nor codes set, sign-up is closed. Locally sign-up is open unless codes are set. `/api/health` reports the current mode as `signups`. |
| `SENTRY_DSN` | Optional switch | Wakes error tracking: server errors are reported to Sentry. Dormant (nothing imported or sent) until set. |
| `PG_POOL_MAX` | No | Most database connections one copy of the server will open (default 10). Lower it if Railway runs several copies, so copies × this stays under the database's connection limit. |
| `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS` | No | Close an idle database connection after this long (default 30000), and give up waiting for a free one after this long (default 10000). Defaults fine. |
| `ANTHROPIC_API_KEY` | Optional switch | Wakes the AI plan writer (personalized plans written by Claude instead of picked from the library) |
| `PADDLE_API_KEY` + `PADDLE_WEBHOOK_SECRET` + `PADDLE_PRICE_ID` + `APP_URL` | Optional switch | Wakes paid Premium upgrades (Paddle checkout + webhook). Until all of them are set, the upgrade button shows "coming soon" and Premium can be granted manually: `UPDATE users SET plan_tier = 'premium' WHERE email = '...';` |
| `PADDLE_ENV` | Optional | `sandbox` (the default, and what anything unrecognised falls back to) or `production` for real money. Decides which Paddle address the server talks to. |
| `ADMIN_EMAIL` | Optional switch | The one account allowed to review coach applications at `/admin/coaches`. The first time that email signs in while no admin exists yet, it becomes the admin — once, ever. `/api/health` reports it as `admin`. |
| `PRIVACY_CONTACT_EMAIL` | Optional | The contact address shown as a mailto link on the `/terms`, `/privacy` and `/refunds` pages (served by the public `GET /api/legal/contact`). Defaults to the owner's address, `naeljam@hotmail.com`. |

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
