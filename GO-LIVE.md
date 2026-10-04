# Go-Live checklist — Cut (Health-Tracker)

Plain-English list of what to set up before launch. Full context: `Agents/docs/go-live-and-security-audit.md`.

## Host
- **Railway** — the committed `railway.json` is the real deploy config (NIXPACKS build, runs migrations before deploy, health check `/api/health`). *(The docs used to say Render; that was stale — corrected.)*

## Must do before launch
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Strong `JWT_SECRET`** — replace the `change-me` placeholder (signs login cookies).
- [ ] **`NODE_ENV=production`** — makes Express serve the built frontend.
- [ ] **`DATABASE_SSL=true`** — needed for essentially all hosted Postgres.
- [ ] **`TRUSTED_PROXY=1`** — Railway puts a proxy in front of the app, so without this every visitor looks like one and the same address and the rate limits lock everyone out at once.
- [ ] **`SIGNUP_INVITE_CODES`** — sign-up is invitation-only until the paywall is live. Set this to one or more codes (comma-separated, 8+ characters each, e.g. `friends-2026,gym-buddies-1`) and hand a code to each person you invite. Without it, production sign-up is **closed** and nobody can create an account. To rotate a code, edit the variable and redeploy; to open sign-up to everyone later, set `SIGNUPS_OPEN=true`. `/api/health` shows the current mode under `signups`. (These are signup invites — different from the coach invite codes inside the app.)

## Backups
Railway does not back up the database unless you switch it on.

- [ ] **Turn on backups** — Railway dashboard → the Postgres service → *Backups* → enable daily backups (keep at least 7 days).
- [ ] **Confirm the first one appears** — come back the next day and check a backup is listed with a size bigger than zero. A backup you have never seen is not a backup.
- [ ] **Do one restore drill** (about 15 minutes, do it once before launch and again every few months):
  1. In Railway, add a second, scratch Postgres service to the project (do **not** touch the live one).
  2. Restore the latest backup into that scratch service (Backups → the backup → *Restore* → pick the scratch service).
  3. Open the scratch service's *Data* / query tab and run: `SELECT count(*) FROM users;`, `SELECT count(*) FROM daily_logs;`, `SELECT count(*) FROM training_sessions;`. The numbers should match roughly what the live database shows for the same three tables (a little lower is fine — the backup is from earlier).
  4. Delete the scratch service so it stops costing money.
  5. Note the date and the three counts somewhere — that is your proof the backup can actually be restored.

## Payments — Whop (built, asleep until keys are set)

Cut uses **Whop for Platforms**: coaches pay a $49 startup fee, students pay
their coach's monthly price, Cut keeps 15% (10% once a coach has 20+ paying
students), and the AI plan is $12.99 a month or $89.99 a year. Nothing is
charged until the variables below are set. Do it in the **sandbox first** and
only move to live keys after every sandbox check passes.

**Set up Whop**
1. [ ] **Create a Whop account** and a company for Cut (whop.com).
2. [ ] **Enable Whop for Platforms** on that company (this is what lets coaches
   be connected accounts that Whop pays and identity-checks).
3. [ ] **Work in the sandbox first:** sign in at sandbox.whop.com and repeat
   the steps below there. Test money only.
4. [ ] **Create three plans:** the coach startup fee ($49, one-off), the AI
   plan monthly ($12.99) and the AI plan yearly ($89.99). Copy each plan id.
5. [ ] **Create an API key** (company settings, developer area) and copy it. It
   is shown once.
6. [ ] **Create a webhook** pointing at `{APP_URL}/api/billing/webhook` (for
   example `https://cut.up.railway.app/api/billing/webhook`), subscribed to
   payment, refund, dispute, membership and payout events. Copy its secret.
7. [ ] **Set these on Railway** and redeploy:
   - `MONEY_PROVIDER` — `whop` (the default)
   - `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`, `WHOP_COMPANY_ID`
   - `WHOP_ENV` — leave blank (sandbox) while testing; `live` only at the end
   - `WHOP_STARTUP_FEE_PLAN_ID`, `WHOP_AI_MONTHLY_PLAN_ID`, `WHOP_AI_YEARLY_PLAN_ID`
   - `APP_URL` — the app's own public address
   - `PAYOUT_METHOD` — leave unset until you have decided (see below)
8. [ ] Check `/api/health` shows billing as configured (it never shows a key).

**Test the whole sandbox flow** (use Whop's test cards)
- [ ] A coach pays the startup fee.
- [ ] The coach completes Whop's identity check and their profile says "Active".
- [ ] A student is accepted by that coach, pays the coach's price, and the
  coaching link turns active only after the payment.
- [ ] Replay the same webhook from Whop's dashboard: the earnings ledger must
  still show that payment exactly once.
- [ ] Refund a payment in the sandbox: a negative line appears.
- [ ] Press **Pay coaches now** on `/admin/coaches` and see the payout appear
  with Whop's reference (or Whop's payout status, under Method A).
- [ ] The student cancels in one tap and keeps access to the end of the period.
- [ ] Both AI plan choices (monthly and yearly) reach a checkout.
- [ ] Password reset: request an email, get it, set a new password, and check
  the same link does not work a second time.

**Decide Method A or B.** Under **A**, Whop takes Cut's fee on every payment
and the coach's share never touches Cut. Under **B**, Cut collects and then
sends the coach's share. In the sandbox, make a renewal payment and check
whether Whop takes Cut's fee again on the renewal (and can switch from 15% to
10% later). If yes, set `PAYOUT_METHOD=A`; if not, set `PAYOUT_METHOD=B`. With
it unset, coach payouts stay off.

**Things you still need to confirm with Whop** (they could not be checked
without your account): that Platforms is switched on for your account; that
payouts reach coaches in Oman and other countries you care about; whether the
fee repeats on renewals (above); what name appears on students' card
statements (then add it to `/refunds`); and the exact event names Whop sends
(the sandbox test above will show any mismatch).

**Go live:** only after the sandbox checks all pass, put the live API key,
webhook secret and live plan ids in, set `WHOP_ENV=live`, and run one small
real payment and refund yourself.

Until the variables are set every money button says "coming soon" and nothing
is charged. Premium can always be granted by hand:
`UPDATE users SET plan_tier = 'premium' WHERE email = '...';`

**Pages Whop will want** — all public, linked from the app, and in place before
you apply: `/pricing`, `/refunds`, `/terms`, `/privacy`, each with a contact
email. They name Whop as the payment processor.

1. **Check the contact email.** The pages show a contact address that defaults
   to `naeljam@hotmail.com`. To change it, set `PRIVACY_CONTACT_EMAIL` on
   Railway. Make sure it is an address you actually read.
2. **Have a lawyer read them.** The pages are plain-language templates marked
   "not yet reviewed by a lawyer". Get them reviewed, then remove the notice.

## Email — Resend (built, asleep until keys are set)

Used for "Forgot password" emails.

- [ ] Create an account at resend.com and **add and verify your domain** (they
  give you a few DNS records to paste in).
- [ ] Create an **API key** and set `RESEND_API_KEY` on Railway.
- [ ] Set `EMAIL_FROM` to an address on that domain, e.g. `Cut <no-reply@yourdomain.com>`.
- [ ] Redeploy, then run the password-reset test above. Until both variables are
  set, the page says "Password reset is coming soon" and sends nothing.

## Progress photos — Railway Storage Bucket (built, asleep until set)

Photos stay switched off in production ("Photo uploads are coming soon") until the app has somewhere safe to keep them.

- [ ] In the Railway project, add a **Storage Bucket**.
- [ ] Open the bucket's settings and copy its five values into the **app** service's variables: `S3_BUCKET` (the bucket name), `S3_ENDPOINT` (its address), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_REGION`. All five are needed. Redeploy.
- [ ] Check `/api/health` shows `"photos": "s3"`, then add one photo from Progress and open it.
- [ ] Keep the bucket **private** — never switch on public access. The app shows each photo only to its owner, or to their coach if they shared it.
- [ ] **Backups are not confirmed.** The database backups above do not include photos. Turn on versioning for the bucket if Railway offers it, or schedule a regular copy of the bucket to somewhere else. Until then, a deleted or lost bucket means lost photos.

## Optional
- [ ] `ANTHROPIC_API_KEY` — wakes the AI plan writer (personalized plans by Claude instead of picked from the 14-plan library).
- `PORT`, `CORS_ORIGIN` — defaults are fine.

## Security note
No committed secrets; JWT in a secure httpOnly cookie; bcrypt passwords; login is rate-limited; coach access verifies an active coach↔client link; all SQL is parameterized. The content-security-policy header is on and scoped to what the app actually loads (see `apps/api/src/app.js` — an earlier version of this note said it was disabled; that's stale). Solid for launch.

## Scaling notes (only matters if the app runs more than one copy)
- **Database connections:** each running copy of the server opens up to 10 database connections by default. If Railway ever runs several copies, keep (copies × 10) under the database's connection limit — or lower the per-copy cap with the `PG_POOL_MAX` env var (see `apps/api/src/db/pool.js`).
- **Rate limits are per copy:** the login and save-speed limits are counted in each server copy's own memory. With one copy (today's setup) that's exact; with several copies each keeps its own count, so the effective limit loosens — fine for now, but worth a shared store (e.g. Redis) if the app ever scales out.
