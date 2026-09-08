# Cut — user-testing report (2026-09-07)

**Verdict: Not ready** — three of the four independently re-tested P1 code bugs sit inside the core loop (the target-date countdown, the day a log is filed on, and the coach's weight-trend caption), which meets the "3+ confirmed P1 code bugs in the core loop" rule. There is no P0 and nothing is lost or leaked; these are four fixes, not a rebuild.

A first-time user can sign up, answer the quiz, get a sensible matched plan, and log weight, sleep, steps, food, habits and a full training session on either a phone or a laptop — every number they type comes back exactly as typed, and no user can see another user's data. What they cannot do is trust the app with a deadline: the target date they set disappears from the screen, the home screen then says they have "NaN" days to go, and anything logged between midnight and 4am in the Gulf is quietly filed on yesterday.

The single most important thing to change: make the server hand back the target date as a plain date (2026-12-01, not a full timestamp) and compute "today" from the user's own clock instead of UTC — one small change each, and they fix the broken countdown, the frozen goals form, the blocked quiz retake and the wrong-day logs together.

**First impression: 52/100** — both blind testers understood the app in about 95 seconds, but only after handing over an email: the link opens on a bare login box, the sign-up error uses the word "displayName" and blames the two fields that were correct, and the coach was told to apply and wait with no timeframe (he said he would not continue).

**Core loop: 62/100** — the loop itself is fast, kind and accurate (signup to a matched plan under a minute; every logged value byte-exact after reload; nine cross-user probes all refused), but the goal countdown is broken, late-night entries land on the wrong day, and the coach's headline number is invented from two days of data.

## What we tested

| Who | Language | Desktop | Phone | Scenarios passed / failed / blocked |
|---|---|---|---|---|
| Consumer — 34, in Dubai, wants to lose 8 kg before a wedding in 3 months and hates apps that shame her | English | Yes | Yes | 8 / 6 / 1 |
| Coach — personal trainer with 6 online clients, wants to see their week without WhatsApp screenshots | English | Yes | Yes | 8 / 2 / 2 |

Tested on a fresh local copy with demo data only. No real order, payment or message was sent.

## First impressions (blind)

- **Consumer, English** — understood it in about 95 seconds; would continue: yes. Quote: *"Once I got in, it was actually lovely — nothing nagged me and logging my weight took five seconds. But it made me hand over my email before telling me what it was, it never asked why I'm here, and when I finally set my wedding date it forgot it and told me I had 'NaN' days to go."* Confusions: the link drops straight onto a login screen with nothing saying what Cut is or whether it's free; the five-question quiz never asks her goal; "Set a target in More" sends her digging through a long settings page and the date she sets there doesn't stick; "Free plan — upgrades coming soon" with no idea what premium gives; the registration error says "displayName". Delights: the copy genuinely doesn't shame you ("no pressure on the number", "Pick what you can keep up for months, not your best week ever"); quiz cards advance on tap; logging a weight instantly filled the tile, the streak and the chart; "Download my data" and "Delete my account" sit right there on More; empty states tell you what to do. Phone vs desktop: the phone is clearly the intended device and is genuinely good; desktop is the same phone screens in a narrow column floating in black with the phone tab bar stretched across the bottom.
- **Coach, English** — understood it in about 95 seconds; would continue: **no**. Quote: *"I clicked a link, got a login box, made an account, answered five questions about my own push-ups — and then found out I have to apply to be a coach and wait. My six clients are still in WhatsApp."* Confusions: nothing on the way in says coaches are welcome; /about and /pricing both return "Page not found"; signup never asks whether he trains himself or trains other people; tapping Next on the empty age question did nothing eight times; typing /clients gave him a complete coach dashboard on a personal account so he thought he was already a coach; "Become a coach" is the second-to-last block of a long settings page; after applying he is told "pending review" with no timeframe and no idea who reviews it. Delights: unusually human onboarding copy; a named matched plan with a real reason why; the coach application asks for credentials and a liability tick, which made the coaching side feel credible; helpful empty states and a fast app; "Download my data" and "Delete my account" on More. Phone vs desktop: the same app both ways — desktop is the phone layout stretched with big empty margins, and every problem reproduced on both.

## Findings, most serious first

### P0

None.

### P1

**One bad date format breaks the goal countdown, freezes the goals form and blocks the quiz retake** (consumer, phone + desktop, English, Certain)
What happened: log in, open More, type a target weight and a target date (2026-12-01), press Save — a "Saved" message appears. Reload More and the date box is empty again. Open Today and the countdown tile reads "DAYS TO TARGET: NaN". Open More > Retake quiz and the last answer is refused with a red "target date must be a date in YYYY-MM-DD format", so the quiz can never be finished. Worse, once a target date exists, pressing Save on the goals page at all is refused, so height, age, step goal, sleep goal and target weight are all frozen and the bad date cannot even be cleared from the screen.
Expected: the saved date shows again as 01/12/2026, Today counts the days left (84), and the quiz and the goals form still work.
Seen: blank date box, "DAYS TO TARGET: NaN", and a permanent refusal on every later save. The date is *not* lost — the data export contains "targetDate":"2026-12-01T00:00:00.000Z". The server just hands it back as a full timestamp, which the date box refuses to display and the day-count maths turns into "NaN".
Evidence: `screenshots/consumer-en/042-desktop-core-more-fail-days-to-target-shows-a-real-number-not-nan-dash.png`, `screenshots/consumer-en/109-desktop-blind-goals2-82-more-reloaded.png`, `screenshots/consumer-en/112-desktop-blind-goals2-85-today-final-desktop.png`, re-test `screenshots/consumer-en/057-desktop-repro-cut-con-01-11-today-decisive-days-to-target.png`, `screenshots/consumer-en/023-desktop-repro-blind-cut-en-01-22-today-decisive.png`, `screenshots/consumer-en/010-desktop-repro-blind-cut-en-02-13-after-reload-decisive.png`
Confirmed by an independent re-test: yes (three separate re-tests, on both phone and desktop, from brand-new accounts).
Fix brief: in `apps/api/src/routes/settings.js`, `toPublicSettings` maps `targetDate: row.target_date`, which Postgres returns as a Date and which serialises as a full ISO timestamp. Return it as a plain YYYY-MM-DD string (`row.target_date && row.target_date.toISOString().slice(0,10)`, or select `target_date::text`). That one change fixes the blank field in More, the NaN in `Dashboard.jsx` `diffDays`, the 400 in `Onboarding.jsx` (which echoes the value straight back into `PUT /api/settings`) and the frozen goals form. Also guard the Today tile so an unreadable date shows the existing "—" placeholder instead of "NaN", and add a test that saves a target date, re-reads settings and asserts the exact string. Merged with the blind tester's two separate reports of the same root cause.

**Anything logged between midnight and 4am in the Gulf is filed on the previous day** (consumer, phone + desktop, English, Certain)
What happened: with the clock at 01:30 on Wednesday 9 September in Dubai time, open the Log screen.
Expected: the screen says "Wed, 9 Sept — TODAY" and the weigh-in is filed on 9 September.
Seen: the screen says "Tue, 8 Sept — TODAY", and saving a weight there really does write to yesterday's row — the re-test captured the save going to the 8 September record. On a returning user that silently overwrites yesterday's finished entry, and the streak and Today tiles inherit the same wrong day. There is no way out at that moment: the "next day" arrow does nothing and the "previous day" arrow jumps two days back, so 9 September is unreachable.
Evidence: `screenshots/consumer-en/084-desktop-edge-midnight-midnight-log-date-label.png`, re-test `screenshots/consumer-en/037-desktop-repro-cut-con-02-12-log-at-0130-local-decisive.png`
Confirmed by an independent re-test: yes.
Fix brief: `Log.jsx`, `Dashboard.jsx`, `Progress.jsx` and `Train.jsx` all define today as `new Date().toISOString().slice(0,10)`, which is UTC. `Onboarding.jsx` and `PlanSection.jsx` already use the correct local form. Make one shared helper that builds the date from the local year/month/day and use it in all four pages, and make the day-shift arrows operate on those parts rather than re-serialising through UTC (that is what makes the arrows skip and stall). Test with the clock faked to 01:30 at UTC+4 and assert the log screen labels the local day.

**Two weigh-ins one day apart become "Trending down — about 2.4 kg/week"** (coach, phone + desktop, English, Certain)
What happened: a client logs 83.1 kg yesterday and 82.4 kg today and nothing else. The coach opens Clients and taps the client's name.
Expected: with two days of data, either an honest "not enough data yet" or just the raw 0.7 kg change. A weekly rate needs a couple of weeks.
Seen: the card says "Trending down — about 2.4 kg/week" — roughly three times any safe rate — sitting right next to the honest "↓ 0.7 kg". The same sentence appears on the client's own Today and Progress screens.
Evidence: `screenshots/coach-en/ut-desktop-numbers2-02-coach-summary-with-real-data.png`, re-test `screenshots/coach-en/033-desktop-repro-coach-01-repro-11-coach-client-expanded-decisive.png`
Confirmed by an independent re-test: yes.
Fix brief: `apps/web/src/lib/trend.js` only guards against fewer than two weigh-ins and a zero-day span, then divides the smoothed change by the days spanned and multiplies by 7 — so 0.35 kg over one day becomes 2.4 kg/week. Require a minimum span (about 14 days between the first and last weigh-in) and a minimum count (about 4–5 weigh-ins) before showing any kg/week caption; otherwise show the raw change ("down 0.7 kg since 7 Sept") or "log a couple more weeks and we'll show a trend". Affects the coach summary, the client Today screen and Progress.

**The Clients screen shows a full working coach dashboard to people who are not coaches — including a coach whose access was revoked** (coach, phone + desktop, English, Certain)
What happened: sign in with any account that is not an approved coach — a plain consumer, a pending applicant, or a coach the admin just revoked — and open /clients (a revoked coach still has it in their history or bookmarks).
Expected: a plain "You're not a coach account" / "Your coach access has ended — here's what to do", never the invite box.
Seen: the full page renders — "INVITE A CLIENT / Generate invite code / YOUR CLIENTS: No clients yet. Send an invite code to get started." — while every request behind it is refused, 5–8 identical refusals per page load because the data layer keeps retrying. A permission denial is painted as an empty list. Pressing the button briefly shows "This action is only available to coach accounts", and that message vanishes on reload.
Evidence: `screenshots/coach-en/ut-desktop-remove-revoke-07-revoked-coach-clients-page.png`, `screenshots/coach-en/068-desktop-blind-desktop-08-clients-after-generate.png`, re-tests `screenshots/coach-en/013-desktop-repro-coach-02-03-clients-page-as-revoked-coach.png`, `screenshots/coach-en/003-desktop-repro-blind-cut-coach-en-02-03-clients-as-plain-consumer.png`
Confirmed by an independent re-test: yes (both the plain-consumer and revoked-coach versions, on both devices). Note: the two lenses disagreed on how serious it is — see "Where testers disagreed".
Fix brief: in `apps/web/src/pages/Clients.jsx`, branch on the user's role and on the COACH_ONLY refusal before rendering anything: show "not a coach — apply under More", "application pending" or "coach access ended" with a link to the right page. Also stop the query layer retrying refusals, so one page load stops producing eight identical errors in the server log. Merged: the same bug was reported separately from the plain-consumer angle and the revoked-coach angle.

**A revoked coach can never become a coach again, and is told nothing** (coach, phone + desktop, English, Certain)
What happened: the admin revokes an approved coach. The ex-coach signs in and opens More, then the coach application page.
Expected: either the admin can restore them, or they can apply again, or at minimum the app says their coach access ended and who to contact.
Seen: the whole coaching block disappears from More with no explanation; the app still records their application as "approved" so a fresh application is refused; and the admin screen offers no restore control and no longer lists them anywhere. The account is permanently stuck as an ex-coach with no route back.
Evidence: `screenshots/coach-en/ut-desktop-revoked-coach-01-revoked-coach-more-page.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: either add a "Restore coach" action beside revoked coaches in the admin screen (re-setting the user's role), or treat a revoked approval as not counting towards the reapply limit in `routes/coachApplications.js` so they can apply again. Either way, show a block on More and on the application status page saying coach access ended and how to get in touch.

**The link opens a bare login box — a newcomer never learns what Cut is** (consumer + coach, phone + desktop, English, Certain)
What happened: open the app's address in a fresh browser with no account.
Expected: a short public page saying what Cut does, who it's for (people training, and the coaches who train them), and that it's free to start, before anyone is asked for an email.
Seen: an immediate redirect to the login screen showing only "Cut — Log in to your tracker", an email box, a password box and a Register link. Guessing /about and /pricing both return "Page not found".
Evidence: `screenshots/consumer-en/028-phone-blind-first-visit-01-landing.png`, `screenshots/coach-en/037-phone-blind-phone-01-landing.png`, `screenshots/consumer-en/085-desktop-blind-journey-50-landing.png`
Confirmed by an independent re-test: not re-tested (reported independently by all four testers).
Fix brief: add a small public landing route for signed-out visitors — one headline, three lines on the quiz-to-plan promise and the daily log, one line that coaches are welcome, "free to start", and Register / Log in buttons — keeping the straight redirect for people who are already signed in. Give /about and /pricing real content or remove them from the router.

**A new coach applies and then waits, with no timeframe and no way through** (coach, phone + desktop, English, Certain — owner setup)
What happened: register, go to More > Become a coach, fill in the application (name shown to clients, credentials, years, how you train people, liability tick), submit, then open Clients.
Expected: either instant coach access, or a clear statement of who reviews applications and how long it takes.
Seen: "PENDING REVIEW — we'll let you know as soon as it's reviewed", with no timeframe and no notification when it is approved. The Clients screen still refuses everything. A new coach can never reach a client's week without the owner logging in as admin.
Evidence: `screenshots/coach-en/085-desktop-blind-desktop3-32-after-submit.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: owner decision. Decide whether coach applications are reviewed by hand and, if so, put the expected turnaround on the application and status screens ("usually within 2 working days") and say how the coach will be told. If nobody is staffing reviews, auto-approve. Either way, the admin approval screen already exists at /admin/coaches and works.

### P2

**A weight of 0 kg or 999 kg is saved without a murmur — and lands in the coach's chart** (consumer + coach, phone + desktop, English, Certain)
What happened: on the Log screen type 0 in Weight and save; repeat with 999.
Expected: something outside roughly 25–350 kg gets a gentle "that doesn't look right".
Seen: both save silently and are displayed as the current weight; the 30-day chart rescales around 999 and the coach's weight trend is rewritten by one client typo. Negative steps *are* caught ("steps cannot be negative"), so the guard exists for other fields but not for weight. The server only refuses above 2000 kg.
Evidence: `screenshots/consumer-en/053-desktop-edge-edge-dashboard-weight-zero.png`
Confirmed by an independent re-test: not re-tested (found separately by both testers).
Fix brief: narrow the weight check in `apps/api/src/routes/logs.js` (line ~159, currently non-negative with a 2000 max) and in health-sync to a human range of about 25–350 kg with a plain-English message, add the same min/max on the Log and Onboarding weight inputs so the message appears before saving, and consider a soft confirm when today's weight differs from the last one by more than about 5 kg.

**Sign-up errors use a code word and outline the fields that are correct** (consumer + coach, phone + desktop, English, Certain)
What happened: on the register screen leave Name empty, fill a valid email and a good password, and press Create account. Then try again with a valid name but an email that already has an account.
Expected: "Please add your name" with the Name box highlighted; and "That email already has an account — log in instead" with a link.
Seen: first, "email, password, and displayName are required" — the developer word displayName — with the Name box *not* highlighted while the correct email and password boxes are outlined red. Second, a vague "We couldn't create your account. Please check your details and try again." with the same two correct fields outlined red. This is the very first screen a new user meets.
Evidence: `screenshots/consumer-en/049-desktop-edge-edge-missing-name-error.png`, `screenshots/consumer-en/032-phone-blind-first-visit-04-after-register.png`
Confirmed by an independent re-test: not re-tested (found by all four testers).
Fix brief: rewrite the register validation messages in `apps/api/src/routes/auth.js` in plain English and per field, return a field key with each error, and in `Register.jsx` apply the error to that field only (today the highlight is hardwired to email and password). Validate the form before posting, and for a taken email say so explicitly with a Log in link.

**The starting weight typed during onboarding never counts as a weigh-in** (consumer, phone + desktop, English, Certain)
What happened: finish the quiz, type a starting weight, press "Start this plan", and land on Today.
Expected: the current-weight tile shows that number and the chart gets its first point.
Seen: "CURRENT WEIGHT —", "Log a couple more weigh-ins to see a trend" and "No weigh-ins in the last 30 days". The number is only kept as a setting, invisible unless you dig into More > Goals.
Evidence: `screenshots/consumer-en/104-phone-phone-core-dashboard.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: in `Onboarding.jsx`, when the starting weight is saved also write today's daily log with that weight (or have the server create today's log when a start weight arrives and no log exists), so the Today tile, streak and chart light up immediately.

**The quiz never asks why I'm here** (consumer, phone + desktop, English, Certain)
What happened: go through all five questions — age, experience, kind of training, equipment, days per week.
Expected: one question about the goal (lose fat / build muscle / get fitter) and the target, since the home screen is built around "Days to target" and "Target weight".
Seen: no goal question anywhere; Today then says "DAYS TO TARGET — Set a target in More", pushing the user to a settings form to enter what onboarding should have asked.
Evidence: `screenshots/consumer-en/068-phone-blind-quiz-plan-30-quiz-5.png`, `screenshots/consumer-en/012-desktop-core-signup-quiz-reveal-plan.png`
Confirmed by an independent re-test: not re-tested (found by both consumer testers).
Fix brief: add a sixth quiz step ("What are you here for?" plus optional target weight and date) and write it straight into settings during onboarding, so the countdown tile is filled from minute one.

**Coaching is invisible during signup — a trainer is funnelled through a personal training quiz first** (coach, phone + desktop, English, Certain)
What happened: register, complete or skip the five personal questions, land on the personal Today screen, then open More and scroll past Account and Your coach to find the coaching block.
Expected: somewhere in signup, "Are you training yourself, or coaching clients?" — routing trainers straight to the coach application.
Seen: registration asks only name, email and password; onboarding asks about the trainer's own age, equipment and training days; "Want to coach clients in Cut? Become a coach" is the fourth block down a long settings page.
Evidence: `screenshots/coach-en/073-desktop-blind-desktop2-21-more-become-coach.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: add a role question to registration or as the first onboarding step ("Tracking my own training" / "I coach clients") and send the coach answer to the application instead of the personal quiz; surface a coaching entry point on the Today screen for accounts with no plan.

**Onboarding "Next" does nothing when the age box is empty** (coach + consumer, phone + desktop, English, Certain)
What happened: register a new account, leave "How old are you?" empty and tap Next — the blind tester tapped it eight times.
Expected: Next visibly disabled until an age is entered, or an inline "Please enter your age".
Seen: nothing happens. No movement, no message, no highlight. The first-time user concludes the app is broken.
Evidence: `screenshots/coach-en/048-phone-blind-phone-05-step7.png`
Confirmed by an independent re-test: not re-tested (found by two coach-side testers and reproduced on both devices).
Fix brief: in `apps/web/src/pages/Onboarding.jsx` the age step silently drops anything that isn't a positive number. Mark the input required, disable Next while it is empty, and show an inline error for an empty or out-of-range value (say 13–100).

**The client summary never shows a single number** (coach, phone + desktop, English, Certain)
What happened: as an approved coach, open Clients and expand a client who has logged weight, sleep, steps and food.
Expected: this week's numbers — current weight and change, sleep average, steps, calories and protein, habit ticks.
Seen: only a weight chart with no value labels, recent sessions, programs and the assign form. The client's own screen says "CURRENT WEIGHT 82.4 kg" but the coach never sees that number anywhere — only a dot on a chart, which also takes 2–4 seconds to paint.
Evidence: `screenshots/coach-en/ut-desktop-summary-assign-02-client-summary-expanded.png`, `screenshots/coach-en/ut-phone-phone-coach-02-phone-client-summary.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: extend the coach client-summary endpoint with this week's aggregates (latest weight and change, average sleep, average steps, average calories and protein, habit completion) and render them as labelled numbers above the chart in `Clients.jsx`, plus a value label on the latest chart point. This is the single feature that decides whether the app replaces the WhatsApp screenshots.

**Nothing tells a coach their application was approved** (coach, phone + desktop, English, Certain)
What happened: apply, have the admin approve it, then go back to the applicant's account.
Expected: a notice — "You're a coach now, here's how to invite your first client".
Seen: no email (none is built) and no in-app notice. The only clue is that a CLIENTS tab silently appears in the bottom bar.
Evidence: `screenshots/coach-en/ut-desktop-invite-02-invite-code-generated.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: show a one-time notice on the dashboard when the role flips to coach ("You're approved — invite your first client"), and put an expected review time on the pending screen. Email notification is owner setup — no mail provider is configured.

**Double-tapping "Generate invite code" produces two live invite codes** (coach, phone + desktop, English, Certain)
What happened: as an approved coach, click Generate invite code twice quickly.
Expected: one click, one code, with the button disabled while the request is in flight.
Seen: two codes are created and both sit in Pending invites. With six clients this becomes a pile of dead codes and it is impossible to tell which one was sent to whom.
Evidence: `screenshots/coach-en/ut-desktop-invite-02-invite-code-generated.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: disable the Generate button while the request is pending in `Clients.jsx`, let the coach label an invite with a client name so pending invites are identifiable, and consider expiring unused invites.

**An approved coach who opens the application page gets the blank "Become a coach" form again** (coach, phone + desktop, English, Certain)
What happened: sign in as an approved coach and open the coach application page — or press the browser Back button right after submitting an application.
Expected: a redirect to the status page, or a line saying "You're already a coach".
Seen: the full empty form renders, liability tick-box and Submit and all; filling it in and submitting is refused with "Your coach application was already approved". After Back, a resubmit is refused with "You already have an application waiting for review".
Evidence: `screenshots/coach-en/085-desktop-blind-desktop3-32-after-submit.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: in `CoachApplication.jsx`, read the user's own application first and redirect to the status page whenever an application exists (pending or decided) or the role is already coach.

**The rest timer dies the moment you leave the Train screen** (consumer, desktop, English, Certain)
What happened: on Train, tap the 90s rest preset and watch it count down, then tap Today or Log to check a number between sets, then come back.
Expected: the countdown keeps running, or at least says it stopped.
Seen: the countdown is gone from every other screen, and Train comes back showing the idle rest-timer bar with no trace of the running rest.
Evidence: `screenshots/consumer-en/030-desktop-core-train-train-rest-timer-running.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: `RestTimer.jsx` keeps its countdown in component state that is thrown away when the Train route unmounts. Hold the target end-time in a context or in local storage so it survives navigation, and show a small running pill in the app shell while it counts down.

**Opening the installed app with no signal shows the login wall** (consumer, phone + desktop, English, Certain)
What happened: log in, let the service worker install, go offline (aeroplane mode, or a gym basement), reload.
Expected: the shell opens still signed in, with the cached day or an honest "You're offline — this will sync when you're back".
Seen: "Cut — Log in to your tracker" with an email and password box. The session appears to be gone until the network returns.
Evidence: `screenshots/consumer-en/085-desktop-blind-journey-50-landing.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: the service worker serves the shell, but the app treats a failed "who am I" request as signed-out. Tell a network failure apart from a real rejection in the auth hook (keep the last known signed-in state on a network error) and show an offline banner instead of the login screen.

**Desktop is the phone app stretched into the middle of the screen** (consumer + coach, desktop, English, Certain)
What happened: open any signed-in screen on a 1440x900 laptop.
Expected: a layout that uses the width — side navigation, or more than one client visible at a time on the coach screen.
Seen: a roughly 600px centred column with the phone's bottom tab bar pinned across the whole laptop screen and about two thirds of the window empty. Everything works; it just looks unfinished.
Evidence: `screenshots/consumer-en/107-desktop-blind-goals2-80-goals-filled-desktop.png`, `screenshots/coach-en/065-desktop-blind-desktop-05-after-onboarding.png`
Confirmed by an independent re-test: not re-tested. Severity disputed — see "Where testers disagreed".
Fix brief: add a desktop breakpoint above about 1024px: move the five tabs to a left sidebar, widen the content column, lay the Today tiles across the width, and give the Clients screen a two-column list-plus-detail layout. The coach screens benefit most, since a coach reviews clients on a laptop.

**The plan runs out at week 4 and nothing says why or what comes next** (consumer, phone + desktop, English, Certain — owner setup)
What happened: finish the quiz, start the recommended plan, look at Train ("YOUR PLAN — WEEK 1 OF 4") and at More ("Free plan — upgrades coming soon").
Expected: one line saying "Free plans run 4 weeks; Premium gives you the full 52-week version".
Seen: no explanation anywhere of what happens at week 5, what Premium contains, or what it costs. A user planning 12 weeks cannot tell whether the 4-week cap is a limit, a bug or a sales pitch.
Evidence: `screenshots/consumer-en/012-desktop-core-signup-quiz-reveal-plan.png`
Confirmed by an independent re-test: not re-tested. Severity disputed — see "Where testers disagreed".
Fix brief: owner decision plus one line of copy. While payments are dormant, add "Free plans cover 4 weeks. Premium unlocks the full 52-week version — coming soon" under the plan banner and on the More plan line, so the cap reads as a choice rather than a defect.

### P3

**Successful logins count towards the "too many attempts" lockout** (consumer, desktop, English, Likely)
What happened: log in with the *correct* password ten times inside fifteen minutes — which a real person does by opening the app on a phone, a tablet and a laptop, or after clearing cookies. The eleventh is refused.
Expected: correct passwords should not count against a guard designed to stop guessing.
Seen: "Too many attempts for this account. Please wait 15 minutes and try again." after ten successful logins.
Evidence: `screenshots/consumer-en/021-desktop-core-log-log-after-reload.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: the per-email login limiter in `apps/api/src/app.js` (10 per 15 minutes) counts every request. Skip successful requests, or reset the counter on a success — the per-IP failure throttle already does exactly that.

**Phone tap targets under 44px: the habit tick, the day arrows and the small Add buttons** (consumer, phone, English, Certain)
What happened: on a 390x844 phone, open the Log screen with a habit added and measure the controls.
Expected: at least 44x44px for anything tapped every day, per the design standards.
Seen: habit checkbox 19x19px inside a 25px tall label; the day arrows 41x41px; "+ Add meal" and the habit Add button 34px tall.
Evidence: `screenshots/consumer-en/108-phone-phone-core-log-habits.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: give the habit label a 44px minimum height with a scaled-up checkbox, and bump the date arrows and the small ghost buttons to 44px at phone widths (`pages/Log.module.css` and the small button size in the shared UI components).

**The ✕ that removes a client is a 30x41px target sitting next to the expand arrow** (coach, phone, English, Certain)
What happened: on a phone, open Clients as a coach and look at a client row.
Expected: destructive controls at least 44x44 and visually separated from the expand control.
Seen: the remove-client ✕ measured 30x41px with the expander immediately beside it; the remove ✕ in the assign form are 25x41. A confirm dialog does follow, which saves it from being worse.
Evidence: `screenshots/coach-en/ut-phone-phone-coach-02-phone-client-summary.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: give the remove buttons a 44x44 hit area with padding (not a bigger icon) in `Clients.module.css`, and add spacing between the ✕ and the chevron.

**Invite codes are case-sensitive, and a wrong-case code is reported as "already used"** (coach, phone + desktop, English, Certain)
What happened: the coach generates a code and reads it to a client, who types it in capitals.
Expected: a code read out loud should work whatever the case, and a wrong code should just say "that code wasn't found".
Seen: the capitalised code is refused with "That invite code was not found or has already been used" — which also tells a client who simply mistyped that somebody stole their code. Codes mix upper and lower case with digits, so l/I and 0/O are easy to confuse over the phone.
Evidence: `screenshots/coach-en/ut-desktop-invite-02-invite-code-generated.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: generate codes from an unambiguous upper-case alphabet (no O, 0, I or 1), compare case-insensitively in `routes/coachLink.js`, and split the error into "not found" and "already used".

**Personal records show a raw date where the rest of the app says "8 Sept"** (consumer, phone + desktop, English, Certain)
What happened: log a training session with a set, then open Progress and look at Personal Records.
Expected: "8 Sept", the format the Log and Recent sessions screens use.
Seen: "Barbell Bench Press | 2026-09-08 | 60 kg × 8".
Evidence: `screenshots/consumer-en/034-desktop-core-more-progress-charts.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: run the personal-records date through the same date-label helper used in `Log.jsx` and `Train.jsx` (`pages/Progress.jsx`).

**Refreshing mid-quiz silently throws away the answers and restarts at question 1** (consumer, desktop, English, Certain)
What happened: start the quiz, answer question 1, refresh the page.
Expected: resume where you were, or say it is starting over.
Seen: straight back to "1 OF 5 — How old are you?" with no message. The browser Back button does the same.
Evidence: `screenshots/consumer-en/069-phone-blind-quiz-plan-30-quiz-6.png`
Confirmed by an independent re-test: not re-tested.
Fix brief: keep the quiz answers and the step number in session storage (or in the address) in `Onboarding.jsx` so a refresh or an accidental Back resumes.

## Owner setup needed before launch (not code bugs)

- **Coach approvals.** Every coach application waits for someone to log in as admin and approve it at /admin/coaches. Decide whether that is you, say so on the application and status screens with an expected turnaround, or auto-approve. Today the applicant just sees "PENDING REVIEW — we'll let you know as soon as it's reviewed" and can never reach a client.
- **Payments (Paddle).** The Premium upgrade is built but asleep. It shows today as "Free plan — upgrades coming soon" on More, with nothing to click, and a plan capped at "Week 1 of 4" with no explanation. Needs the Paddle account, one subscription price and the five environment variables — the full sequence is in GO-LIVE.md.
- **What Premium actually gives.** Even while payments stay off, decide the sentence: "Free plans cover 4 weeks; Premium unlocks the full 52-week version." Right now a user planning 12 weeks cannot tell whether the 4-week cap is a limit or a defect.
- **AI-written plans.** Built and asleep until ANTHROPIC_API_KEY is set on Railway. Nothing in the app mentions it today.
- **Email.** No mail provider is configured, so nothing can tell a coach they were approved, and there is no password reset — a user who forgets their password (or trips the 15-minute lockout) has no self-service way back in.
- **Native iPhone and Android apps.** Not built. The web app installs as a PWA (manifest and service worker both verified good), which is the interim answer.

## Things that looked wrong but are not bugs

- The install prompt never appeared during testing. That is the headless test browser, not the app — the manifest (standalone, 192 and 512 icons, correct name) and an active service worker were both verified by hand instead.
- "Free plan — upgrades coming soon" and the dead upgrade button are the dormant Paddle switch, not a broken button.
- No AI-written plans appeared because the AI key is deliberately unset.
- No approval email arrived because no mail provider is configured — that is owner setup, not a missing feature in the code.
- Premium and the 52-week plans could not be seen because Premium is granted by hand in the database, as documented.
- The 15-minute lockout after ten wrong passwords is intended behaviour and the message is clear; the only real complaint is that *successful* logins count towards it too (P3 above).
- One tester deliberately locked a test account out and left it locked; that account clears itself after 15 minutes.

## What worked well

- Every number typed came back byte-exact after a reload, on both devices and for both roles: weight, sleep, steps, macros, meal names and calories, and a training set of 60 kg x 8 at RPE 7 reopening unchanged. A coach's program arrived in the client's account word for word, labelled "From your coach".
- Cross-user isolation is airtight. Nine separate attempts to reach someone else's data — a second consumer probing the first user's logs, nutrition, programs, settings, export and habit delete; a client hitting coach endpoints; a coach opening a non-client's summary; a consumer opening the admin screen — all came back refused or empty, and the first user's data survived a delete attempt.
- Signup to a matched plan takes under a minute and the match is sensible: gym answers produced a hypertrophy plan, beginner-with-minimal-equipment answers produced a dumbbell-at-home plan, each with a real reason why.
- The copy genuinely does not shame anyone — "no pressure on the number", "Pick what you can keep up for months, not your best week ever", "Be honest — the right starting point beats the impressive one" — and empty states explain what to do instead of sitting blank.
- The coach decline-and-reapply path is well made: the admin's written reason reaches the applicant word for word, a first decline offers exactly one more try, and the second says so plainly and the server enforces it.
- Trust signals are up front and real: "Download my data" produced a complete 11 KB file of the tester's own numbers, "Delete my account" is right there, and the Privacy, Terms and Refunds pages all have real content.
- Robustness basics hold: double-clicking Save does not duplicate a log, the same-day log replaces rather than appends, a save on throttled 3G still completed and stored (6.5 seconds), pages load in about 1.9 seconds on throttled 3G, and long or garbage input is refused in plain English.
- The PWA foundation is in place — manifest, icons, an active service worker, and the app still works after a reload with the service worker live.

## What we could not test, and why

- **Premium and the 52-week plans** — Premium is granted by hand in the database and the upgrade button is the dormant Paddle switch.
- **The real install prompt** — the test browser never fires it; the manifest and service worker were verified instead.
- **Password reset / forgot password** — not built, and there is no link on the login screen, so a locked-out user has no self-service route.
- **AI-written plans** — the AI key is unset (dormant switch, owner setup).
- **Email notification of coach approval** — no mail provider is configured.
- **The coach's real situation, six clients at once** — each client needs its own account, invite code and redemption; one client was taken end to end and the rest were time-boxed, so list density, sorting and "who hasn't logged this week" at six clients is untested.
- **Real on-phone keyboard overlap** — the harness cannot render an iOS keyboard; field positions were measured instead, and the kg input on Train sits inside the keyboard zone, so it relies on the browser scrolling it into view. Worth one manual check on a real iPhone.
- **Coach isolation and PWA checks repeated on the phone** — the refusals are enforced by the server and the phone build talks to the same endpoints, so they were verified once on desktop only.
- **Whether an odd program (0 sets, 999 reps) renders sensibly for the client** — the assignment saved, but it was not opened in the client's session.

## Phone verdict

The phone is where this app belongs and it is genuinely good on both sides. A consumer went from a cold start to a matched plan in under a minute, logged weight, sleep, steps, calories, protein, a meal and a habit, and every value came back exactly right after a reload; nothing scrolls sideways, the bottom nav is generous, and no field is trapped under the sticky header or the tab bar. The whole coach loop also works at phone size — sign up, apply, get approved, invite, read a client, write and assign a program — with a clean assign form and nothing hidden behind the tab bar. The phone-specific complaints are small and specific: a 19x19px habit checkbox and several 34–41px buttons that need two goes with a thumb, and a 30x41px remove-client ✕ sitting right beside the expand arrow, which is uncomfortably close to a destructive mistake. Everything else the phone suffers from — the vanishing target date, the NaN countdown, the wrong day after midnight, the fake weekly trend, the silent Next button — is the same on desktop, not a phone problem.

## Where testers disagreed

- **The vanishing target date.** The first tester read it as "the date is silently thrown away on save". The re-tester proved that is wrong in a way that matters for the fix: the date *is* saved correctly on the server (the export and the API both show it), the screen simply cannot display the format it gets back. Same bug, but the fix is one line in how the server hands the date back, not a save that needs repairing.
- **How serious that same finding is.** The re-test lens kept it at P1 (a main journey becomes unusable and the goals form freezes); a second grading lens called it P2 (a secondary goal field, not the daily logging loop). Both are recorded; this report treats it as P1 because once a target date exists, no goal setting can be saved at all.
- **The Clients screen shown to non-coaches.** One lens downgraded it to P2 — the server refuses everything, nothing is exposed, nothing is lost, and the page is only reachable by typing the address or using an old bookmark. The other kept it at P1, because a revoked coach opening their old bookmark sees an intact-looking coach panel and would reasonably conclude Cut lost their six clients. Both views stand; this report keeps P1 for the revoked-coach case and notes the plain-consumer case is milder.
- **The fake "2.4 kg/week" trend.** One lens kept it at P1 (a coach could give harmful advice from it); another argued P2, because the honest "↓ 0.7 kg" sits in the same row and the two-dot chart makes the one-day span visible. Kept at P1 here — the caption is the sentence a busy coach reads.
- **Desktop being a stretched phone app.** The consumer tester called it a P2 code bug ("it doesn't look like a product I'd pay for"); the coach testers called it P3 and a design gap ("mildly annoyed, it works"). Listed at P2, since the coach is the person most likely to be on a laptop.
- **The 4-week free plan with no explanation.** Rated P2 by the scenario tester and P3 by the blind tester. Listed at P2 because it is the moment a paying customer decides whether to stay.

## Numbers

P0 0 · P1 7 · P2 14 · P3 6 · owner-setup 6 · scenarios run 27 (passed 16, failed 8, blocked 3) · screenshots 40 in docs/user-testing/screenshots/. Build tested: commit c43b1ec of /home/user/Health-Tracker.
