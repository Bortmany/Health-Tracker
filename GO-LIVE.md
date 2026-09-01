# Go-Live checklist — Cut (Health-Tracker)

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** — the committed `railway.json` is the real deploy config (NIXPACKS build, runs migrations before deploy, health check `/api/health`). *(The docs used to say Render; that was stale — corrected.)*

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Strong `JWT_SECRET`** — replace the `change-me` placeholder (signs login cookies).
- [ ] **`NODE_ENV=production`** — makes Express serve the built frontend.
- [ ] **`DATABASE_SSL=true`** — needed for essentially all hosted Postgres.

## Payments — Paddle (built, asleep until keys are set)

The code is finished and switched off. Paddle sells the subscription as the
merchant of record (they handle tax), which means **Paddle has to approve the
app before it can take money** — and they only review a site that is already
live. So the order matters:

1. **Deploy Cut first, still dormant.** Nothing below can start until the app
   is on a real web address.
2. **Add the pages Paddle's review asks for** — see the blocker note below.
3. **Apply to Paddle** at paddle.com with that live address, and wait for their
   approval (usually a few days; they may come back with questions).
4. **Create the product and its price** in the Paddle dashboard: one product
   ("Cut Premium"), one recurring price. Copy the price id — it looks like
   `pri_...`.
5. **Create a server API key** (Paddle dashboard → Developer tools →
   Authentication) and copy it. It is shown once.
6. **Create a notification destination** (Developer tools → Notifications)
   pointing at `https://YOUR-APP-ADDRESS/api/billing/webhook`, subscribed to
   `subscription.activated`, `subscription.updated`, `subscription.canceled`,
   `subscription.paused` and `subscription.expired`. Copy its secret key.
7. **Set the five variables on Railway** and redeploy:
   - [ ] `PADDLE_API_KEY` — the server API key from step 5
   - [ ] `PADDLE_WEBHOOK_SECRET` — the notification secret from step 6
   - [ ] `PADDLE_PRICE_ID` — the `pri_...` id from step 4
   - [ ] `PADDLE_ENV` — `sandbox` while testing, `production` for real money
     (anything else, including leaving it out, means sandbox)
   - [ ] `APP_URL` — the app's own public address, e.g.
     `https://cut.up.railway.app`
8. **Test in the sandbox first.** Sign up at sandbox.paddle.com, repeat steps
   4–6 there, set `PADDLE_ENV=sandbox`, and buy the plan with one of Paddle's
   test cards. The account should flip to Premium within seconds of paying.
   Then swap in the live keys and set `PADDLE_ENV=production`.

Until the variables are set the upgrade button says "coming soon" and nothing
is charged. Premium can always be granted by hand:
`UPDATE users SET plan_tier = 'premium' WHERE email = '...';`

**For Paddle approval — the pages Paddle looks for.** Paddle reviews the live
site and expects to find, linked from it: terms of service, a privacy policy,
**and a refund / cancellation policy**, plus clear pricing and a way to contact
whoever runs the app.

- Terms — **exists** at `/terms`.
- Privacy — **exists** at `/privacy`.
- Refund / cancellation policy — **exists** at `/refunds`. It covers
  cancelling (stops future charges, access runs to the end of the paid period,
  no data is deleted), the three cases where we refund, how to ask, and names
  Paddle as the merchant of record that appears on card statements. It is
  linked from the More page and from the bottom of the terms and privacy pages.

**Two things still to do on these pages before applying:**

1. **Add your contact email.** Three pages carry the placeholder
   `[owner — add your contact email here before launch]` — `/terms`,
   `/privacy` and `/refunds` (twice on the refunds page). Paddle needs a real
   support address visible on the site, so replace all of them.
2. **Have a lawyer read them.** All three pages are plain-language templates
   and each shows a visible "not yet reviewed by a lawyer" notice. Get them
   reviewed, then remove that notice — it looks weak to a reviewer.

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
