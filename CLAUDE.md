# Cut — Project Handover (auto-loaded every session)

## What this is

Cut is a fat-loss and training tracker for people who aren't sure what to train, plus the coaches who train them. React + Vite frontend, Express + raw `pg` + Postgres backend (no ORM), npm workspaces monorepo, installable PWA, deployed on Render from `main`. The owner is **not a developer** — write all comments, commit messages, and reports in plain English a non-developer can understand.

## Current state (roadmap complete)

All planned phases are built, tested, reviewed, and merged to `main`. 48/48 backend tests passing. Features live:

- Auth (JWT httpOnly cookie), consumer/coach roles, rate-limited login, 8+ char passwords
- Onboarding quiz → matched against 14 seeded workout plans (progression rules + 52-week phases); free tier = 4-week plans, premium = 52-week; `plan_tier` on users
- Daily logs (weight/sleep/steps/habits/activities/injuries), nutrition (macros + meals), training logs (programs, sessions, sets), rest timer, personal records, streaks, 50-exercise library with autocomplete
- Coach accounts: invite codes (redeem = consent), client summaries, assign/edit programs in the client's account
- Charts (Chart.js, lazy-loaded), PWA manifest + service worker, weekly habit summary endpoint
- `POST /api/health-sync` for future native apps (device data fills blanks, never overwrites manual entries)

**Dormant switches** (code shipped, asleep until env vars are set on Render):
- `ANTHROPIC_API_KEY` → AI plan writer (`apps/api/src/lib/aiPlanGenerator.js`)
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_ID` + `APP_URL` → paid Premium upgrades (`apps/api/src/routes/billing.js`; webhook uses raw body, wired in `app.js` before `express.json`)

## Conventions (non-negotiable)

- **Migrations:** numbered SQL files in `apps/api/src/db/migrations/` (next is 016). Always append the same DDL to `docs/schema.sql`.
- **Routes:** `router.use(requireAuth)` first; every query parameterized (`$1…`); user-scoped queries filter `user_id = req.userId`; `asyncHandler` wrapper; snake_case → camelCase via `toPublicX(row)` mappers; errors `{ error: { message, code } }` in plain English; literal paths registered before `/:id`.
- **Nested writes:** transaction — BEGIN, upsert parent, DELETE children, re-INSERT, COMMIT; ROLLBACK in catch; `client.release()` in finally (see `routes/programs.js` `replaceDays`).
- **Postgres trap:** placeholders in `COALESCE($n, …)` or typed comparisons need explicit casts (`::uuid`, `::boolean`, `::integer`) or you get runtime 42883 errors.
- **Frontend:** thin wrappers in `src/api/`, TanStack Query hooks in `src/hooks/` (mutations invalidate BOTH list and detail keys), CSS Modules with the custom props from `index.css`, skeleton divs for loading (never spinners), forms keep `''` and convert with `x === '' ? null : Number(x)` on submit. Reuse `components/LineChart.jsx` for charts.
- **Tests:** Node test runner, `app.listen(0)` + fetch, fresh timestamped user per file, cover happy path + replace-not-append + cross-user isolation. Dates come back as ISO timestamps — compare with `.slice(0, 10)`.

## Workflow (established with the owner)

1. Design the phase centrally, then dispatch the project agents: `backend-builder`, `frontend-builder`, `content-curator` (seed data) — in parallel where independent, with exact API contracts in the prompts. **The agents now live in the central `Agents` repo** (under `.claude/agents/dev/`) — a session must include the Agents repo as a source or no agents will load. The `dev-lead` commander there can run the whole build → verify → review loop as one delegated step.
2. `verifier` agent runs migrations + tests + build (+ prod smoke when warranted).
3. `code-reviewer` agent reviews the diff; fix real findings before committing.
4. Commit with a short plain-English message, push to the work branch, merge `--no-ff` to `main`, push — Render auto-deploys `main`.
5. Report to the owner in plain English; pause for review between major phases unless told to batch.

**Environment notes:** local Postgres stops when the sandbox idles — `service postgresql status || service postgresql start` before anything DB-related. Historical work branch: `claude/loving-clarke-eep2es` (a fresh session may get its own designated branch — follow the session's instructions). Token-lean habits the owner asked for: don't re-read unchanged files, lean verification (tests + build), short commits.

## Backlog (needs the owner)

| Item | What's needed |
|---|---|
| Confirm Render deploy is green | render.com dashboard; open the `.onrender.com` URL |
| Real payments | Stripe account, one subscription Price, set the 4 env vars, point a webhook at `/api/billing/webhook` |
| AI-written plans | Set `ANTHROPIC_API_KEY` on Render |
| Native iPhone/Android apps | Apple Developer $99/yr, Google Play $25, a Mac — follow `docs/mobile.md` |
| Premium meanwhile | `UPDATE users SET plan_tier = 'premium' WHERE email = '...';` in Render's DB shell |

Possible future work: Stripe customer portal (manage/cancel), password reset via email, progress photos (needs file storage), coach chat/notes, push notification reminders.

## Key files

| File | What it is |
|---|---|
| `README.md` | Full app description, env var table, deploy steps |
| `docs/schema.sql` | Always-current schema dump |
| `docs/mobile.md` | Step-by-step for App Store / Play Store |
| `render.yaml` | Render Blueprint (service + database) |
| `Agents` repo, `.claude/agents/dev/` | The six project agents and their encoded conventions (moved to the central Agents repo — include it in the session) |
| `apps/api/src/db/migrations/` | 15 migrations so far; runner is `src/db/migrate.js` |
