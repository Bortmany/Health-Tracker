# Cut — iOS App Design Spec

*A written design document only — no code. A future iOS developer (or a Capacitor
wrapper project following `docs/mobile.md`) should be able to build from this.
The backend API already exists and does not change for this app.*

## 1. What the app is and who it's for

Cut is a fat-loss and training tracker for people who aren't sure what to
train, plus the coaches who train them. A short quiz matches each user to one
of 14 structured workout plans; day to day they log weight, sleep, steps,
habits, food and training sessions, and watch their streak, charts and
personal records grow. The iOS app is for two audiences in one binary:
**consumers** (the everyday tracker) and **coaches** (who monitor clients and
assign programs). The killer reason to go native: automatic Apple Health data
and a muscle-heat home-screen widget — things the installed web app can't do.

## 2. Navigation model

**Tab bar (consumer accounts) — 5 tabs:**

| Tab | Existing screen it maps to |
|---|---|
| Today | Today dashboard (plan week, weight trend, habit ring, streak) |
| Log | Daily log (weight, sleep, steps, habits, food, injuries) |
| Train | Training log (program day, sets, rest timer, exercise autocomplete) |
| Progress | Charts, personal records, **and the new Muscle Heatmap** |
| More | Settings, plan details, premium upgrade, coach connection |

**Coach accounts:** same shell, but the Today tab is replaced by **Clients**
(the coach client list). Coaches rarely log for themselves; if they do, the
other tabs still work on their own account.

**Modals (sheets), not pushes:**
- Add/edit a log entry (weight, meal, habit) — half-height sheet.
- Rest timer — a persistent bottom bar during a session that expands to a
  full sheet; it must survive backgrounding (see notifications).
- Onboarding quiz — full-screen cover on first launch, exactly the existing
  quiz steps (age, experience, goal, equipment, days per week).
- Premium upgrade — full-screen sheet (Stripe checkout in a web view until a
  native purchase decision is made — see App Store notes).

**Deep links** (`cut://` scheme + universal links on the web domain):
- `cut://today`, `cut://log/2026-07-26`, `cut://train`, `cut://progress/heatmap`
- Widget taps land on `today` (streak widget) or `progress/heatmap` (heat widget).
- A coach invite code link opens More → "Connect a coach" with the code
  pre-filled.

## 3. Screen-by-screen notes

Design language everywhere: **dark background, lime accent** — near-black
surfaces, lime for progress rings, streak flames, primary buttons and chart
lines. Loading states are skeleton blocks, never spinners (house rule from the
web app). Numbers are big; labels are quiet.

**Today** — top card: "Week 6 of your plan — deload week" in plain English,
exactly the copy the web app generates. Below: weight trend spark-chart,
weekly habit ring (lime fill), streak counter with a subtle flame. Pull to
refresh. One "Log today" button if today is empty.

**Log** — a dated list, defaulting to today, with a date strip to swipe back.
Each metric is a row (weight, waist, sleep, HRV, recovery, strain, steps,
habits, activities, injuries, food with calories + macros + meals). Tapping a
row opens the half-sheet editor with a large native number pad. Empty values
stay visually empty — blanks matter because Health sync only fills blanks.
Rows filled by Apple Health show a small "from Apple Health" tag so the user
knows what they typed vs. what synced.

**Train** — today's program day at the top ("From your coach" tag when
assigned). Each exercise shows the "last time" hint the API already provides.
Logging a set: reps + weight steppers, big lime "Done" button, rest timer
starts automatically. Exercise search uses the 50-exercise library with form
cues shown inline. Personal records get a full-width lime flash moment.

**Progress** — segmented control: Charts | Records | **Muscle Heat**. Charts
reuse the same data as the web (weight, calories, measurements). Records is a
grouped list of PRs by exercise.

**Muscle Heatmap (new screen — being built on the web now)** — a front/back
human body diagram whose 16 regions (chest, front/side/rear delts, biceps,
triceps, forearms, traps, lats, lower back, abs, obliques, glutes, quads,
hamstrings, calves — the exact ids in migration 016) are colored by recent
training volume: dark grey = untouched, warm lime gradient = trained, hottest
= most volume in the chosen window (7 / 14 / 30-day toggle). Native version:
draw the body as vector shapes (SwiftUI paths), animate color transitions,
flip between front and back with a horizontal 3D flip gesture. Tapping a
region shows a sheet listing which exercises and sets heated it. This screen
is the app's screenshot — treat it as the hero. Data comes from logged sets
joined to each library exercise's `primary_muscles` (full heat) and
`secondary_muscles` (half heat), same rule as the web feature.

**Clients (coach)** — list of connected clients with weight-trend sparkline
and last-session date. Client detail: their summary, recent sessions, and
"Assign / edit program" (the same program editor the web has). Invite-code
generation lives here with a native share sheet.

**More** — profile, plan tier, premium upgrade, coach connection, Apple
Health settings (what syncs, last sync time), notification preferences,
sign out.

## 4. Native affordances

**Apple Health (HealthKit) — the headline feature.** Read-only access to
weight, steps, sleep, and active energy/workouts. The app reads locally (Apple
provides no server API) and pushes batches to the existing endpoint:

- `POST /api/health-sync` with `{ date, weight, steps, calories, sleep }`
  entries, max 90 days per call (contract in `docs/mobile.md`).
- **The endpoint's contract is the design rule: device data fills blanks and
  never overwrites anything the user typed by hand.** The UI must honor the
  same idea — Health-sourced values are tagged, and typing over one replaces
  it permanently (manual wins from then on).
- Sync on app open + a background refresh task; a manual "Sync now" in More.
- First-run: a friendly permission screen explaining exactly which four types
  are read and why, before triggering the system HealthKit prompt.

**Widgets:**
- **Muscle-heat + streak widget (medium):** mini body silhouette with the
  live heat colors on the left, streak count + this week's habit ring on the
  right. The at-a-glance "did I train legs this week?" answer.
- **Streak widget (small + lock screen circular):** streak number with flame;
  goes grey (not red — no shaming) if today isn't logged yet.

**Haptics:** light tap on completing a set; success buzz on a personal
record; distinct double-tap when the rest timer ends; subtle tick on habit
ring completing the week.

**Notifications (local first, respectful):**
- Rest timer done (local, only while a session is open).
- Evening streak-saver, only if nothing is logged by a user-chosen hour and
  only if the user opted in. One per day maximum.
- "Your coach assigned you a new program" (push — needs a small server
  addition to send pushes; flag for the owner, don't build silently).
- Never nutrition guilt, never marketing.

**Share sheet:** coaches share invite codes; consumers can share a
progress-chart or heatmap image (rendered card with the Cut wordmark).

**No Face ID gate** — this data is personal but the friction isn't worth it
for a daily logger; rely on the device passcode.

## 5. Dark/light mode

**Dark only.** Cut's brand is dark + lime; the web app ships one theme and
the iOS app should match. Declare dark appearance in the project so system
sheets and keyboards come up dark. Revisit only if users ask.

## 6. Data & sync

- Talks to the existing Express API on Railway — same endpoints the web uses.
  Auth is a JWT httpOnly cookie; a Capacitor build pointed at the live origin
  keeps cookies working with no server change (noted in `docs/mobile.md`). A
  fully native app would store the JWT in the Keychain instead.
- **Offline:** cache the last-fetched Today, Progress and current program so
  the gym-basement case works read-only. Set logging queues locally and
  replays when back online (sets are per-session and per-user, so replays are
  safe). Everything queued shows a quiet "will sync" mark. Daily-log edits
  offline are allowed for today only, queued the same way.
- Health-sync batches are retried until the server confirms; the 90-day cap
  per call is respected by chunking.

## 7. App Store notes

- **Category:** Health & Fitness. **Age rating:** 4+.
- **Privacy questionnaire (honest answers):** collects email (account),
  health & fitness data (weight, body measurements, sleep, steps, nutrition,
  workouts), all **linked to the user's account** because that's the whole
  product; no tracking across other apps, no ads, no data sold. HealthKit
  data must never be used for advertising — Apple's hard rule, and ours.
- HealthKit capability + usage strings are mandatory or review rejects the
  build (already warned in `docs/mobile.md`).
- **Premium billing decision for the owner:** digital subscriptions inside an
  iOS app normally must use Apple In-App Purchase (Apple takes 15–30%) rather
  than the existing Stripe checkout. Options: ship v1 with premium features
  visible but purchasable "on the website" (allowed if the app doesn't link
  to the purchase — App Review is strict here), or add IAP later. Flagged,
  not decided here.
- Account deletion must be reachable in-app (More → delete account) — an App
  Store requirement; the API needs a delete endpoint if one doesn't exist yet.
