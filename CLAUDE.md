# Cut — Project Handover (auto-loaded every session)

## What this is

Cut is a fat-loss and training tracker for people who aren't sure what to train, plus the coaches who train them. React + Vite frontend, Express + raw `pg` + Postgres backend (no ORM), npm workspaces monorepo, installable PWA, deployed on Railway from `main`. The owner is **not a developer** — write all comments, commit messages, and reports in plain English a non-developer can understand.

## Current state (roadmap complete)

All planned phases are built, tested, reviewed, and merged to `main`. 245/245 backend tests passing (older counts in this file were out of date — re-run `npm test` rather than trusting a number). Features live:

- Auth (JWT httpOnly cookie), consumer/coach roles, rate-limited login, 8+ char passwords
- Onboarding quiz → matched against 14 seeded workout plans (progression rules + 52-week phases); everyone gets the full 52-week matched plan free; `plan_tier = 'premium'` now means "AI plan on" — an AI-written plan that re-adjusts weekly when opened 7+ days after `user_plans.last_adjusted_on` (Oct 2026, spec `Agents/docs/specs/cut/solo-ai-plan.md`, migration 023)
- Daily logs (weight/sleep/steps/habits/activities/injuries/calories burned), training logs (programs, sessions, sets), rest timer, personal records, streaks, 50-exercise library with autocomplete
- Coach accounts: invite codes (redeem = consent), client summaries, assign/edit programs in the client's account
- Coach journey (Sep 2026, plan in `Agents/docs/specs/cut/coach-journey.md`): members apply to coach from the More page and the owner approves at `/admin/coaches` (the `ADMIN_EMAIL` account, granted once at first sign-in); approved coaches get a profile and referral link, a public directory at `/coaches`, student requests and in-app invites; the Clients tab shows quiet days, weekly adherence, a weight trend and private notes. Coach billing is Step 5 (below).
- Muscle heat map (`/heatmap`, `GET /api/muscle-heatmap`): library exercises and the seeded plans' exercises carry muscle tags (migration 022, `exercise_muscle_tags` for the plan names); the screen sends its own day as `?today=` so the fading counts from the user's day, not UTC. The same `?today=` (validated in `lib/userToday.js`, falling back to Oman's day) drives the logging streak, the plan's week number, the data export's streak and the coach's quiet-days / this-week signals. Public front page at `/` for signed-out visitors; its join buttons follow the sign-up mode.
- Charts (Chart.js, lazy-loaded), PWA manifest + service worker, weekly habit summary endpoint
- `POST /api/health-sync` for future native apps (device data fills blanks, never overwrites manual entries)
- Coach tools, Step 4 (Oct 2026, spec `Agents/docs/specs/cut/coach-tools.md`). Every coach read checks for an ACTIVE `coach_clients` link on each request; anything else is the same plain 404.
  - Check-ins (024): one per student per week; answers snapshot their questions; each coach edits up to 8 questions.
  - Messages (025): one thread per `coach_clients` link, 60 sends/hour per person; an ended link hides its thread.
  - Photos + measurements (026): `lib/photoStorage.js` is the only file that knows about storage; photos are private until the student shares one, and a coach sees shared ones only via an active link. Chest/arms/hips/thighs/neck sit on the daily log and a linked coach sees them with no switch.
- Coach money, Step 5 (Oct 2026, spec `Agents/docs/specs/cut/coach-billing.md`, migration 027): coaches pay a $49 startup fee and pass Whop's identity check; a student pays the coach's own price (floor $10, cap $500); Cut's commission is 15%, or 10% at 20+ paying students, in integer cents rounded half-up with the rate stored on the row. The ledger (`commission_ledger`) has `source_ref` UNIQUE and every write is `ON CONFLICT DO NOTHING`, so replayed webhooks change nothing; refunds and chargebacks are negative rows. Payouts only happen from the owner's "Pay coaches now" button (locked against double-clicks). Invite-code students stay free. Migration 028 adds the payout-retry safety rules (original account and key kept, 3-day manual-review limit), saved retries for failed cancels and automatic refunds, dispute-won give-backs and the delayed coach switch. Password reset uses hashed, single-use, 1-hour tokens sent by Resend.

**Dormant switches** (code shipped, asleep until env vars are set on Railway):
- `ADMIN_EMAIL` → the one account that can review coach applications (granted once, at first sign-in)
- `ANTHROPIC_API_KEY` → AI plan writer (`apps/api/src/lib/aiPlanGenerator.js`)
- `MONEY_PROVIDER` (whop default) + `WHOP_API_KEY` + `WHOP_WEBHOOK_SECRET` + `WHOP_COMPANY_ID` + `WHOP_ENV` + `WHOP_STARTUP_FEE_PLAN_ID` + `WHOP_AI_MONTHLY_PLAN_ID` + `WHOP_AI_YEARLY_PLAN_ID` + `APP_URL` → payments through Whop (coach startup fee, students paying coaches, AI plan). The `lib/billing` folder/file is the only place that names the provider; `routes/billing.js` uses it; the webhook signature is checked against the raw body, wired in `app.js` before `express.json`. `PAYOUT_METHOD` (A|B; unset = payouts dormant) controls coach payouts
- `RESEND_API_KEY` + `EMAIL_FROM` → password-reset emails (asleep without them)
- `S3_BUCKET` + `S3_ENDPOINT` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` + `S3_REGION` → progress photos in a private Railway Storage Bucket. Without all five, photos are dormant in production (uploads refused, list says `enabled: false`); locally they go in `UPLOAD_DIR`

## Conventions (non-negotiable)

- **Migrations:** numbered SQL files in `apps/api/src/db/migrations/` (next is 029). Always append the same DDL to `docs/schema.sql`.
- **Routes:** `router.use(requireAuth)` first; every query parameterized (`$1…`); user-scoped queries filter `user_id = req.userId`; `asyncHandler` wrapper; snake_case → camelCase via `toPublicX(row)` mappers; errors `{ error: { message, code } }` in plain English; literal paths registered before `/:id`.
- **Nested writes:** transaction — BEGIN, upsert parent, DELETE children, re-INSERT, COMMIT; ROLLBACK in catch; `client.release()` in finally (see `routes/programs.js` `replaceDays`).
- **Postgres trap:** placeholders in `COALESCE($n, …)` or typed comparisons need explicit casts (`::uuid`, `::boolean`, `::integer`) or you get runtime 42883 errors.
- **Frontend:** thin wrappers in `src/api/`, TanStack Query hooks in `src/hooks/` (mutations invalidate BOTH list and detail keys), CSS Modules with the custom props from `index.css`, skeleton divs for loading (never spinners), forms keep `''` and convert with `x === '' ? null : Number(x)` on submit. Reuse `components/LineChart.jsx` for charts.
- **Tests:** Node test runner, `app.listen(0)` + fetch, fresh timestamped user per file, cover happy path + replace-not-append + cross-user isolation. Calendar dates: every Postgres `DATE` comes back as a plain `YYYY-MM-DD` string, set once in `db/pool.js` (the driver's default turns it into a JS Date that slips a day when the server's timezone is ahead of UTC, e.g. Oman); the existing `date::text AS date` casts are harmless belt-and-braces. On the screens, clean any date from the server with `toCalendarDay` / `daysBetween` in `lib/localDate.js` so a bad value shows "—", never NaN. The suite must pass under both `TZ=Asia/Muscat` and `TZ=UTC`. On the screens, "today" is the device's own day, never `toISOString().slice(0, 10)` (that is the UTC day); plain-logic screen tests live next to the file as `*.test.js` in `apps/web` and run as part of `npm test`.

## Workflow (established with the owner)

1. Design the phase centrally, then dispatch the dev crew: the generic `builder` (run two in parallel — one on the server side, one on the screens — with exact API contracts in the prompts) and `content-curator` (seed data). **The agents live in the central `Agents` repo** (under `.claude/agents/development/`) — a session must include the Agents repo as a source or no agents will load. The crew is generic and works on any repo: it reads THIS file's Conventions section first (the registry in `Agents/docs/apps.md` points here). The `dev-lead` commander can run the whole build → verify → review loop as one delegated step — tell it the repo is Health-Tracker.
2. `verifier` agent runs migrations + tests + build (+ prod smoke when warranted). One command does build + tests: `npm run verify` (Postgres must already be running; it never starts it).
   - **Separate test database:** `npm test` never touches the development database. It uses `TEST_DATABASE_URL`, or if that's unset the dev `DATABASE_URL` with `_test` added to the database name (`cut` -> `cut_test`), or `postgres://localhost:5432/cut_test` if neither is set. Before the tests run it creates that database if missing and applies every migration (`apps/api/src/db/prepareTestDb.js`; run it alone with `npm run test:db -w apps/api`). It refuses any database that isn't on this computer.
   - **Pre-push check:** a git hook (`.husky/pre-push`, installed automatically by `npm install`) runs `npm run verify` before every `git push`, and stops with a plain message if local Postgres isn't running (`brew services start postgresql@16`). In a real emergency, `git push --no-verify` skips it.
3. `code-reviewer` agent reviews the diff; fix real findings before committing.
4. Commit with a short plain-English message, push to the work branch, merge `--no-ff` to `main`, push — Railway auto-deploys `main`.
5. Report to the owner in plain English; pause for review between major phases unless told to batch.

**Environment notes:** local Postgres stops when the sandbox idles — `service postgresql status || service postgresql start` before anything DB-related. Each session may get its own designated work branch — follow the session's instructions. Token-lean habits the owner asked for: don't re-read unchanged files, lean verification (tests + build), short commits.

## Backlog (needs the owner)

| Item | What's needed |
|---|---|
| Confirm Railway deploy is green | railway.app dashboard; open the app's public URL |
| Real payments | Whop account with Platforms enabled, three plans (startup fee, AI monthly, AI yearly), API key, webhook at `/api/billing/webhook`, set the env vars, test in the sandbox, decide payout Method A or B — full sequence in `GO-LIVE.md`. Also Resend (domain + key + `EMAIL_FROM`) for password reset |
| AI-written plans | Set `ANTHROPIC_API_KEY` on Railway |
| Native iPhone/Android apps | Code side is DONE (Capacitor installed, `apps/web/capacitor.config.json`, Apple Health sync in `apps/web/src/native/healthSync.js`). Still needs: Apple Developer $99/yr, Google Play $25, a Mac, and the real live URL in the config — follow `docs/mobile.md` |
| Premium meanwhile | `UPDATE users SET plan_tier = 'premium' WHERE email = '...';` in Railway's DB shell |

Possible future work: PayPal as a fallback payment provider, scheduled automatic payouts (once the button is trusted), push notification reminders.

## Key files

| File | What it is |
|---|---|
| `README.md` | Full app description, env var table, deploy steps |
| `docs/schema.sql` | Always-current schema dump |
| `docs/mobile.md` | Step-by-step for App Store / Play Store |
| `railway.json` | Railway deploy config (build, migrate, start, health check) |
| `Agents` repo, `.claude/agents/` | The generic dev crew (builder, researcher, content-curator in `development/`; verifier, code-reviewer in `quality/` — full roster in that repo's CLAUDE.md) — works on any repo by reading this file's conventions; include the Agents repo in the session |
| `apps/api/src/db/migrations/` | 29 migrations so far; runner is `src/db/migrate.js` |
