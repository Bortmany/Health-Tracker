# Go-Live checklist — Cut (Health-Tracker)

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** — the committed `railway.json` is the real deploy config (NIXPACKS build, runs migrations before deploy, health check `/api/health`). *(The docs used to say Render; that was stale — corrected.)*

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Strong `JWT_SECRET`** — replace the `change-me` placeholder (signs login cookies).
- [ ] **`NODE_ENV=production`** — makes Express serve the built frontend.
- [ ] **`DATABASE_SSL=true`** — needed for essentially all hosted Postgres.

## Payments — Stripe (built, asleep until keys are set)
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `APP_URL`
- [ ] Point a Stripe webhook at `/api/billing/webhook`.
- Until set, the upgrade button shows "coming soon". You can grant Premium by hand: `UPDATE users SET plan_tier = 'premium' WHERE email = '...';`

## Optional
- [ ] `ANTHROPIC_API_KEY` — wakes the AI plan writer (personalized plans by Claude instead of picked from the 14-plan library).
- `PORT`, `CORS_ORIGIN` — defaults are fine.

## Email
- None wired (password reset / welcome email are future backlog only).

## Security note
No committed secrets; JWT in a secure httpOnly cookie; bcrypt passwords; login is rate-limited; coach access verifies an active coach↔client link; all SQL is parameterized. The content-security-policy header is on and scoped to what the app actually loads (see `apps/api/src/app.js` — an earlier version of this note said it was disabled; that's stale). Solid for launch.

## Scaling notes (only matters if the app runs more than one copy)
- **Database connections:** each running copy of the server opens up to 10 database connections by default. If Railway ever runs several copies, keep (copies × 10) under the database's connection limit — or lower the per-copy cap with the `PG_POOL_MAX` env var (see `apps/api/src/db/pool.js`).
- **Rate limits are per copy:** the login and save-speed limits are counted in each server copy's own memory. With one copy (today's setup) that's exact; with several copies each keeps its own count, so the effective limit loosens — fine for now, but worth a shared store (e.g. Redis) if the app ever scales out.
