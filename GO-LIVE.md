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
No committed secrets; JWT in a secure httpOnly cookie; bcrypt passwords; login is rate-limited; coach access verifies an active coach↔client link; all SQL is parameterized. Solid for launch. (Minor future tidy: the content-security-policy header is currently disabled in helmet.)
