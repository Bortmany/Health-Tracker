# Cut — redesign screen specs

Written for builders to implement verbatim. Companion reading: `docs/competitor-research.md` (why these choices), `apps/web/src/styles/tokens.css` (the only source of colors/spacing/type/radius — always reference tokens by name, never hex or raw px in new CSS Modules).

This app is **English-only** — no bilingual copy, no RTL. "Basics that always apply" from the brief still hold: minimum ~44px touch targets on every tappable element, skeleton loading (never spinners, matches the existing `.skeleton` convention), and text/background pairings that read fine on a cheap phone screen in daylight (stick to `--color-text` / `--color-text-muted` / `--color-text-faint` on `--color-bg` / `--color-surface` — don't invent new grays).

Design at **~390px wide**; every screen must also read well up to the `--screen-max-width: 640px` cap the `Screen` wrapper enforces (content doesn't stretch edge-to-edge on a bigger phone/small tablet — it stays centered with breathing room).

## Voice reminder (bakes into every empty state and micro-copy below)

Cut talks like a knowledgeable friend, not a drill sergeant: encouraging, plain, never shaming. Concretely:
- No red text or red icons for a missed target, a skipped day, or an over-target calorie number. `--color-danger` is reserved for destructive actions (delete/remove/stop, with a confirm) and genuine errors (a save failed).
- Empty states say "not yet" and point to the next small action, never "you haven't."
- Weight/number fluctuation gets a normalizing caption, not silence and not alarm.

---

## Shared structure (applies to every screen below)

**Wrapper:** every screen renders inside `Screen` (max-width 640, the app's outer padding, scrolls under the fixed `BottomNav`).

**Section pattern:** a screen is a vertical stack of `Card`s (or a bare hero area at the very top), each with a `SectionTitle` (mono, uppercase, `--tracking-label`) as its header when it's a secondary section. The hero content at the top of a screen sits in its own `Card` but doesn't need a `SectionTitle` — its content is self-evidently the main thing.

**Loading:** every screen shows `Skeleton` blocks shaped like the content that's coming (a stat-row skeleton is three short rectangles side by side, a chart skeleton is one ~160px-tall rectangle, a list skeleton is 2–3 row-height rectangles) — never a spinner, never a blank white/black flash. Skeletons appear where the real content will be, at roughly the same size, so the layout doesn't jump when data arrives.

**Errors:** `ErrorText` renders inline, directly under the action or field that failed, in plain English (the API already returns `{ error: { message } }` in plain English — display `error.message` as-is). Never a full-screen error unless the whole page's primary query failed (then: `EmptyState`-style block with the message and a "Try again" `Button secondary` that refetches).

**Buttons:** primary = the one main action per screen/card (Save, Start session, Log in). Secondary = alternate actions (Cancel, Browse all plans). Ghost = low-emphasis links/toggles (+ Add exercise, collapse/expand). Danger = destructive only (Remove client, Stop plan, Delete), always behind a confirm (`window.confirm` is fine — matches current behavior, no new dependency).

**Forms:** unchanged conventions from today — number inputs keep `''` while empty and convert on submit, `inputMode="decimal"`/`"numeric"` as already used, autocomplete via `datalist` for exercise names (unchanged, already works, don't rebuild it).

---

## Primitive extension needed: `LineChart` dual-line support

The dashboard/progress weight charts require a **pale raw line + a bold smooth trend line on the same chart** (Part 4). `LineChart` today takes a single `values`/`color` pair. It needs to accept **multiple series** on the same label set — e.g. a `series` array of `{ values, color, width, pointRadius }` — so a caller can pass one entry using `--color-chart-raw` (thin, small points) and one using `--color-chart-line` (thicker, no points). This is an extension of the existing component (still Chart.js, already a dependency — no new package). Grid/tick colors should come from `--color-chart-grid` / `--color-chart-tick` instead of the hardcoded hex currently in the component.

**Trend-line rule** (compute client-side, no new endpoint): the trend series is a **moving average of the last up to 7 logged weigh-ins** (not calendar days — people don't weigh in daily, so average over the most recent N entries, N = min(7, count)). Plot it on the same date labels as the raw series (for a date with only 1–2 prior weigh-ins, the trend value equals the plain average of what's available — it doesn't need 7 full points to start).

**Trend caption rule** (used wherever a weight chart appears): compare the smoothed value at the start of the visible range to the smoothed value at the end; word it as direction + a rough rate, e.g. *"Trending down — about 0.3 kg/week"* / *"Trending up — about 0.2 kg/week"* / *"Holding steady"*. With fewer than 2 weigh-ins, don't show a caption (there's no trend yet — the empty state below handles that case).

---

## `BottomNav` / `AppLayout`

**Purpose:** always-visible navigation; the one piece of chrome present on every screen.

**Layout:** unchanged structure — a fixed bar (`--nav-height`) pinned to the bottom of `AppLayout`, `Screen` content scrolls above it with bottom padding equal to the nav height so nothing hides behind it (current `paddingBottom: '4.5rem'` should become `var(--nav-height)` plus a little breathing room).

**Tabs, consumer:** Today · Log · Progress · Train · More — same five, same order as today's Home/Log/Progress/Train/More (only the rename Home → **Today**; no reordering — the brief says "same 5+coach structure" and reordering isn't asked for).

**Tabs, coach:** Today · Log · Progress · Train · Clients · More (Clients inserted before More, same as today's insertion point).

**Style:** restyle onto tokens — active tab uses `--color-accent` text with the small dot indicator (keep the existing dot-above-label shape, just recolor it: `--color-accent` when active, `--color-text-faint` when inactive) on a `--color-surface` bar with a `--color-border` top hairline. Inactive label color `--color-text-muted`. Each tab is a flex-equal column so with 6 tabs at 390px width each is ~65px wide — keep labels to one word so they never wrap, and make sure the whole tab (not just the text) is the tap target (min 44px tall, full column width).

**Interaction:** tap a tab → navigate to its route (unchanged react-router `NavLink` behavior, `end` on the Today tab's `/` route so it doesn't stay highlighted on sub-routes).

---

## Today (renamed from Dashboard)

**Route:** `/` · **Purpose:** answer "what should I do right now, and how is it going" in one glance.

### Layout, top to bottom

1. **Greeting** — plain text, not a card: *"Hey, {displayName}"* in `--font-display`, `--text-xl`.
2. **Hero — Today's session `Card`.** This is the hero element. Wired to the user's active plan (`useMyPlan`), not a placeholder.
3. **Quick-log row** — a horizontal row of small `Button ghost` chips: **+ Weight · + Sleep · + Meal · + Steps**. Each navigates to `/log?focus=<field>` (see Log screen's focus handling below). Scrollable horizontally if it overflows on the narrowest phones; otherwise wraps to a second line rather than shrinking below tap-target size.
4. **Stat row** — three `StatCard`s side by side (`Current weight`, `Streak`, `Days to target`), same three metrics as today's dashboard, restyled:
   - *Current weight*: big value = latest raw weigh-in (people want to see today's actual number, not a smoothed one). Sub-line = the trend caption rule above (e.g. "Trending down — about 0.3 kg/week"), not a raw day-over-day diff — this is the fix for "scale anxiety" the research calls out. If fewer than 2 weigh-ins: sub-line reads *"Log a couple more weigh-ins to see a trend"*.
   - *Streak*: big value = `{n} days`, sub-line = "days in a row with a log" (unchanged wording, already good).
   - *Days to target*: big value = days remaining (unchanged calc), sub-line = target weight if set, else *"Set a target in More"* (this is a navigation hint in muted text, not a tappable link on the card itself — keep it simple, the destination is already one tab away).
5. **Weekly habit ring `Card`** — `ProgressRing` primitive showing the same weekly compliance % as today (`useHabitSummary` + `useHabits`, unchanged calculation), with the meta line below it ("{completed} of {possible} habit checks this week"). If no habits are tracked yet: ring shows an empty/dim ring (no percentage), meta line: *"No habits tracked yet — add one or two in More and they'll show up here."*
6. **Weight trend `Card`** — the full dual-line chart (raw + smooth trend, per the `LineChart` extension above), last 30 days, with the trend caption underneath. This is the detailed view; the stat card above is the glance view. Loading: chart-shaped `Skeleton`. Empty (no weigh-ins in 30 days): `EmptyState` — *"No weigh-ins in the last 30 days — log one anytime, no pressure on the number."* No CTA needed (the quick-log chip above already offers "+ Weight").

### Hero card detail — "Today's session"

Data source: `useMyPlan()` for the active plan; `useTrainingLogs({ from: today, to: today })` to check whether today already has a session logged; `useProgram(plan.programId)` (existing `useProgram` hook) + the most recent training log's `programDayId` to figure out which day comes next.

**"Next day" rule** (compute client-side, no new endpoint): find the most recent training log whose `programId` matches the active plan's `programId`; find that log's `programDayId`'s position in `program.days`; the next day is the following entry in `program.days` (wrap to the first day past the end). If no session has ever been logged against this program, the next day is `program.days[0]`.

States:
- **Plan active, no session logged today:** Card shows the plan name, *"Week {weekNumber} of {durationWeeks}"*, an "Easy week" badge if `plan.deload` is true, the next day's name (e.g. "Next up: Push Day"), and the plan's plain-English guidance line (`plan.guidance` — already exists, e.g. *"Add about 2.5% to your working weights compared with last week."*). Primary `Button`: **"Start session"** → navigates to `/train` with the program and next day pre-selected (pass them as URL query params, e.g. `?program=<id>&day=<id>`; Train reads these on mount and pre-fills `form.programId`/`form.programDayId`, same effect as manually selecting them today — no new API, just wiring Train to read its own query string).
- **Plan active, session already logged today:** Card reads *"Session logged today"* with a quick summary (exercise count, or the session's notes if present), primary `Button`: **"Continue / edit today's session"** → `/train` with that session's edit mode pre-opened (pass `?edit=<trainingLogId>`; Train reads this and calls the same `setEditingId` it already has).
- **Plan complete** (`plan.completed`): *"Plan complete — nice work."* Secondary `Button`: **"Choose a new plan"** → `/train`.
- **No plan adopted yet:** `EmptyState` inside the hero card — *"No plan running yet. A few taps and you'll have one built around your goals."* Primary `Button`: **"Find a plan"** → `/train` (lands on `PlanSection`'s recommended list, unchanged).
- **Loading:** card-shaped `Skeleton` (~120px).

---

## Log

**Route:** `/log` · **Purpose:** the daily entry screen — fast, calm, only shows what's relevant.

### Layout, top to bottom

1. **Header** — date navigator (← date label →, unchanged behavior) + sticky **Save** `Button primary` (top-right, same as today). When viewing today's date, show a small "Today" tag next to the date label so it's obvious at a glance whether you're editing today or a past day.
2. **Quick strip** — always visible, not collapsible: three `Field`s side by side for **Weight (kg)**, **Sleep (h)**, **Steps** — the three most logged metrics, surfaced without opening anything (this directly answers "calmer form density" — most days a person only needs these three).
3. **"Use yesterday's numbers" `Button ghost`** — shown only when yesterday's log has at least one value the current form doesn't already have. Tapping fills every *currently-blank* metric field (weight, waist, sleep, hrv, recovery, strain, steps, calories) from yesterday's entry — it never overwrites a field the person has already typed into today, same "fill blanks, don't clobber" rule the backend already uses for device sync. Implementation: fetch yesterday's log with the existing `useLog(shiftDate(date, -1))` hook (already supports arbitrary dates) — no new endpoint.
4. **Collapsible sections** (accordion `Card`s — `SectionTitle` header doubles as the expand/collapse tap target, with a chevron that flips). Default open/closed state:
   - **Nutrition** — *open by default* (core to a fat-loss tracker, alongside weight). Calories eaten / protein / carbs / fat fields, plus the meals list (add/remove rows), unchanged fields and behavior from today.
   - **More metrics** — *collapsed by default* unless any of its fields already have a value today. Contains waist, HRV, recovery %, strain, calories burned (everything from today's `METRIC_FIELDS` not already in the quick strip).
   - **Activities** — *collapsed by default* unless rows already exist. Unchanged behavior (activity picker + custom name fallback + duration + add/remove row).
   - **Habits** — *rendered only if the person has active habits* (unchanged conditional — if `form.habits.length === 0`, the section doesn't exist at all, not just collapsed). When present, open by default (checking off habits is a fast one-tap action, no reason to hide it).
   - **Injury check-in** — *rendered only if there are active injury check-ins* (unchanged conditional). Open by default when present (it's there because it matters today).
   - **Notes** — *collapsed by default*, plain textarea, unchanged.
5. Bottom `ErrorText` if either the log or nutrition save fails (unchanged — both mutations can fail independently, show both messages if both fail).

### Deep-link focus (from Today's quick-log chips)

`/log?focus=weight` → quick strip's Weight field gets focus + the screen scrolls to top (it's already visible). `/log?focus=sleep`/`?focus=steps` → same, those live in the quick strip too. `/log?focus=meal` → the Nutrition section expands (it's open by default already) and scrolls into view, focus lands on "+ Add meal". This is a small addition to Log's mount logic (read `searchParams`, no new API).

### States

- **Loading:** three stacked `Skeleton` blocks (quick strip height, then two section-card heights) — matches today's loading shape, just restyled.
- **Empty (brand-new day, nothing entered):** not a special empty state — it's just a form with blank fields. No "nothing here yet" message needed; the fields themselves invite entry.
- **Error:** `ErrorText` under the header, plain-English message from the failed mutation.

---

## Train

**Route:** `/train` · **Purpose:** the workout logger — fast set entry with the previous number to beat, timer that starts itself, and the program library.

### Layout, top to bottom

1. **Header** — "Train" title + sticky **Log session / Update session** `Button primary` (label matches whether editing, unchanged).
2. **Plan card** (`PlanSection`, reused as-is functionally) — restyle onto `Card`/tokens. This is where the **progression rule in plain English** already lives (`plan.guidance`) — make it visually prominent: its own line under the plan name, not buried after the phase text. Reads e.g. *"This week: add about 2.5% to your working weights compared with last week."* Keep the "Easy week" badge, the week-of-duration header, "Stop plan" (`Button danger sm`, confirm dialog, unchanged), and the recommended/browse-all template list when no plan is active (unchanged functionality, restyled).
3. **Programs `Card`** — list of active programs (name, day count, "From your coach" tag when applicable — unchanged), then the "+ New program" builder (unchanged multi-day/multi-exercise form, restyled onto `Field`/`Button` primitives).
4. **Log/Edit session `Card`** — this is the hero element when a session is being built. Contains:
   - **Rest timer bar** — see auto-start behavior below.
   - Date + Program selectors (`Field`/`Select`, unchanged), Day selector + "Load day's exercises" when a program is selected (unchanged).
   - **Per-exercise blocks**, each with:
     - Exercise name input (with the exercise-library `datalist` autocomplete, unchanged) + remove button.
     - A "Last session" context line under the name when history exists: *"Last ({date}): 60×8, 62×8, 62×7"* (today's `ExercisePreviousHint`, kept as a quick summary of the whole exercise).
     - **Per-set rows**, redesigned so the "number to beat" sits inline with each set, not just as one summary line: each row keeps its weight/reps/RPE inputs, and gets a small muted hint directly beside or below the weight+reps pair showing that same set-number's previous values as a placeholder-style tag, e.g. *"prev 60×8"*. Data source: the existing `useExerciseHistory(name, { before: excludeId })` result's `sets` array — match by `setNumber` (set 1's hint uses the previous entry's set 1, set 2's hint uses its set 2, etc.; if the previous session had fewer sets, later sets simply show no hint).
     - A **"Done" checkbox** per set (new UI-only control — see rest-timer behavior below). Checking it doesn't change what gets saved; it's a session-flow aid, not a data field.
     - "+ Add set" (`Button ghost`, unchanged).
   - "+ Add exercise" (`Button ghost`, unchanged).
   - Notes `Field` (unchanged).
5. **Recent sessions `Card`** — unchanged list (date + Edit button per row), restyled as simple rows.

### Rest timer — auto-start on "done"

Checking a set's **Done** box starts the rest timer automatically at its last-used duration (default 90s the very first time in a session) and pins the running countdown to the top of the Log/Edit session card (same bar component, `RestTimer`, extended to accept a `start(seconds)` trigger from outside itself rather than only from its own preset buttons). The preset buttons (60s/90s/2m) stay for manually starting/adjusting rest — checking "Done" is a shortcut into the same timer, not a separate mechanism. **The Done checkbox state is not persisted** — it's local UI state for the current visit only, purely to drive the timer; refreshing the page or leaving and coming back clears it. *(If the owner later wants completed-set state to survive a refresh mid-workout, that needs a new `completed` boolean column on `training_log_sets` plus a migration — flagged as **needs API**, not required for this redesign.)*

### "Just today vs. update my program" choice

Triggered whenever a session being saved is tied to a program day (`form.programDayId` is set) **and** it's an edit of an existing session (`editingId` is set) — i.e., every time someone changes something in a session that came from a program day and hits Save. Before the save fires, show a small inline choice (two `Button`s in a row, not a separate page) between:
- **"Just today"** (default/pre-selected) — saves only this session via the existing `updateTrainingLog` mutation, unchanged.
- **"Update my program too"** — does the same session save, *and* also updates the underlying program day's exercises via the existing `updateProgram` mutation (`PUT /programs/:id`, already supports replacing a day's exercises) so future sessions built from "Load day's exercises" reflect the change. Both mutations already exist — this is purely a frontend choice-then-call-both flow, **no new endpoint needed**.

Copy: *"Save this change for just today, or update your program so it applies every time?"*

### States

- **Loading:** unchanged — a card-shaped `Skeleton` where `PlanSection` and the programs list will land.
- **Empty, no programs:** *"No program yet. Adopt a recommended plan above, or build your own below."* (secondary line under the Programs section header, not a full-block `EmptyState` — the "+ New program" builder is right there).
- **Empty, no sessions logged:** `EmptyState` in the Recent sessions card — *"No sessions yet — your first one starts your log."*
- **Error:** `ErrorText` under the header for save failures (unchanged messages).

---

## Progress

**Route:** `/progress` · **Purpose:** the deeper look — trend charts, PRs, and a month of consistency at a glance.

### Layout, top to bottom

1. **Title** — "Progress" (`--text-xl`).
2. **Weight trend `Card`** — dual-line chart (last 60 days, same raw+trend rule as Today), trend caption underneath. Loading: chart `Skeleton`. Empty: `EmptyState` — *"Nothing to chart yet — weigh-ins you log will show up here."*
3. **Calories trend `Card`** — single-line chart (`--color-chart-line-2`, unchanged data source), no dual-line needed here (calories don't need the same noise-smoothing framing weight does — the research calls out weight specifically). Loading: chart `Skeleton`. Empty: *"No food logged yet — log a few days and your calorie trend will appear here."*
4. **Consistency calendar `Card`** — new. A simple month grid (7 columns × up to 6 rows, one cell per calendar day) for the current month, each day's cell filled (`--color-accent`, low-opacity fill is fine, e.g. background at reduced alpha, text `--color-text`) if that date has a daily log, and empty (`--color-surface-2` or `--color-border` outline only) if not. Small back/forward arrows to move between months (mirrors the date-nav pattern already used in Log). Data source: `useLogsRange({ from: firstOfMonth, to: lastOfMonth })` — a day counts as "logged" if it appears in the returned array (same definition the streak endpoint already uses: a `daily_logs` row exists for that date). Optional secondary marker: a small dot on cells that also have a training session that day (from `useTrainingLogs({ from, to })` over the same range) — purely additive, both queries already exist, no new endpoint. Loading: a grid-shaped `Skeleton` (7×6 blocks). Empty (no logs this month): cells simply render unfilled — no separate empty-state message needed, the grid itself communicates it; optionally a small caption under the grid: *"No days logged this month yet — every log fills in a square."*
5. **Personal records `Card`** — unchanged list (name, date, weight × reps, top 10), restyled as simple rows. Empty: *"Log some weighted sets and your best lifts will land here."*

### States

Loading/empty/error per-section as above; no single page-level empty state (the four sections load and empty independently, matching today's pattern).

---

## Clients (coach)

**Route:** `/clients` (coach role only) · **Purpose:** triage first — who needs a look — then detail on tap.

### Layout, top to bottom

1. **Header** — "Clients" title.
2. **Invite a client `Card`** — unchanged functionality: "Generate invite code" `Button primary`, the generated code shown with a "Copy" button, hint text ("Share this code with your client — they enter it under More."), and a pending-invites list (code + remove) shown only when invites are pending. Restyle onto tokens.
3. **Your clients `Card`(s)** — **this is the hero element**, redesigned as a **triage list**. Each client is a row (not yet expanded) showing, left to right or stacked on narrow width:
   - Name + email (existing).
   - **Weight direction** — small text, e.g. "↓ 0.4 kg" / "↑ 0.3 kg" / "steady", computed from the client's last two weigh-ins in `weighIns` (from `useClientSummary`). Always rendered in **neutral muted text** (`--color-text-muted`), never green/red/success/danger — a coach's clients may be cutting or bulking, so Cut never assumes which direction is "good" for a given client.
   - **Sessions this week** — e.g. "3 sessions this week", counted client-side from `recentSessions` (dates ≥ the start of the current week).
   - **Last log** — e.g. "Last log: 2 days ago" / "Logged today", taken as the more recent of the client's latest weigh-in date and latest session date (see the "needs API" note below for the gap this leaves).
   - A small ✕ **Remove** (`Button danger ghost sm`) that doesn't trigger row expand (stop propagation, unchanged confirm-dialog behavior).
   - A chevron (▼/▲) showing expand state.
4. Tapping a row (anywhere except Remove) expands **`ClientDetail`** inline below it — same information architecture as today, restyled onto `Card`/`SectionTitle`: weight trend chart (now dual-line, same rule as Today/Progress), recent sessions list, programs list, and the "Assign a program" builder (unchanged multi-day form). Collapsing re-collapses on a second tap.

### Data note — how the triage row gets its numbers (implementation detail for the builder)

`GET /clients` today returns only `displayName`/`email` per client — no weight/session/log data. To populate the triage row for every client (not just the one currently expanded), call the existing `useClientSummary(clientId)` for **every** client in the list as soon as it renders (not only on expand as today's code does) — it's a light query (30 days of weigh-ins + last 5 sessions) and results are cached by TanStack Query, so expanding a row afterward is instant, no refetch. This uses the existing endpoint, just called earlier/more often — no new endpoint required for weight direction or sessions-this-week.

**Needs API (flagged, not required to ship this redesign):** the "last log" figure above is an approximation — it's the more recent of the last *weigh-in* date and the last *training session* date, because the current summary endpoint doesn't return a general "last log of any kind" date (a client who only logged sleep or steps this week, with no weigh-in and no session, would show a stale "last log" even though they were active). A precise version needs the coach summary endpoint extended to also return the most recent `daily_logs` date regardless of which fields were filled. Ship the approximation now; flag the extension as a follow-up if the owner wants exact accuracy here.

### States

- **Loading (client list):** row-shaped `Skeleton`s (2–3).
- **Empty (no clients):** `EmptyState` — *"No clients yet. Send an invite code to get started."*
- **Error (invite generation):** `ErrorText` under the "Generate invite code" button.
- **Error (assign program):** `ErrorText` inside the expanded detail's builder, unchanged.

---

## More

**Route:** `/more` · **Purpose:** account, coach connection, quiz retake, and goal settings — restyled, functionally unchanged.

### Layout, top to bottom

1. **Header** — "More" title + sticky **Save** `Button primary` for the Goals form below.
2. **Account `Card`** — name, email, plan-tier line (unchanged: "Premium plan" / "Free plan — upgrades coming soon" / "Free plan — Upgrade to Premium" ghost-button-as-link when billing is enabled), coach-account label when applicable, and **Log out** `Button secondary` on the right. Restyle only.
3. **Your coach `Card`** — consumer accounts only (unchanged conditional). Shows "Coached by {name}" + "Remove coach" (`Button danger ghost sm`, confirm dialog) when connected; otherwise an invite-code `Field` + "Connect" `Button primary`, with the success line ("Connected with {name}.") and `ErrorText` on failure — unchanged behavior.
4. **Training quiz `Card`** — unchanged: one line of copy ("Your answers shape which workout plans we recommend.") + "Retake quiz" `Button secondary` linking to `/onboarding`.
5. **Goals `Card`** — the same seven fields (start weight, target weight, target date, height, age, step goal, sleep goal) as `Field`/`Input` grid, unchanged validation/conversion rules.

### States

Loading: `Skeleton` where the Goals form lands (unchanged). Error: `ErrorText` under the header for a failed save (unchanged). No empty states needed — this screen is always a form, never a list that can be empty.

---

## Onboarding

**Route:** `/onboarding` · **Purpose:** the short quiz that seeds plan recommendations, ending in a payoff instead of dropping straight into the app.

**Keep the quiz exactly as short as it is today — 5 steps, same questions, same "Skip for now" and "Back" affordances.** The redesign adds reassurance copy at the two most vulnerable data points (age, and — since weight isn't currently asked *in* the quiz — the optional weight field on the new reveal step below) and a proper payoff at the end. It does **not** add a step to the quiz itself.

### Layout, top to bottom (quiz steps, unchanged structure)

1. **Progress line** — "{n} of 5" (unchanged).
2. **Question title + subtitle** (unchanged per-step copy, restyled onto tokens — `--font-display` title, `--color-text-muted` subtitle). Keep the existing reassurance line on the age step: *"This helps us pick plans that suit your body, not fight it."*
3. **Answer control** — number input + Next for the age step, a vertical list of option cards (label + optional hint) for every other step (unchanged).
4. **Footer** — "Back" (`Button ghost`, hidden on step 1) and "Skip for now" (`Button ghost`, always available, unchanged destination: skips straight to `/`).

### New: the reveal step (after the 5th answer, before landing on the app)

Once the quiz finishes saving (`saveAndFinish` succeeds), instead of navigating straight to `/train`, show a reveal screen in the same route/component (no progress counter — it's not "6 of 5", it's a distinct payoff moment):

1. **Heading** — *"Here's your plan"* (`--font-display`, `--text-2xl`).
2. **Sub-copy** — *"Based on what you told us, this is where we'd start."*
3. **Recommended plan `Card`** — the top match from `useRecommendedTemplates()` (already ranks by the just-saved quiz answers — make sure the settings mutation's success handler invalidates the `recommendedTemplates` query so this reflects the fresh answers, not a stale cache). Shows the plan's name, description, and its goal/experience/days-per-week tags (same tag row as `PlanSection`'s `TemplateCard`).
4. **Optional starting weight** — a single `Field` with reassurance copy: *"Want to log your starting weight? Totally optional — you can always add it later."* Leaving it blank is fully supported.
5. **Primary `Button`: "Start this plan"** — adopts the top-recommended template (`useAdoptTemplate`, existing mutation) and, if a weight was entered, saves it via the existing settings update (`startWeight`). On success, navigate to `/` — landing straight on the Today screen's hero card now showing the freshly adopted plan is the payoff.
6. **Secondary `Button`: "See other plans"** — navigates to `/train` without adopting anything (lands on `PlanSection`'s full recommended/browse list).
7. **Ghost link: "Skip for now"** — navigates to `/` (unchanged fallback, no plan adopted).

**Empty case** (rare — recommendations came back empty): `EmptyState` — *"We couldn't find a perfect match yet — that's alright. Browse all plans and pick one that feels right."* with a single `Button`: **"Browse all plans"** → `/train`.

**Loading:** while the quiz's own settings query loads before the first step (existing behavior) — a `Skeleton` block, unchanged. While the reveal step's recommended-templates query loads — a `Card`-shaped `Skeleton`.

---

## Login

**Route:** `/login` · **Purpose:** get back in, fast, no friction.

### Layout

Centered `Card` on the bare `--color-bg` background (no `BottomNav` — this route sits outside `AppLayout`, unchanged). Top to bottom: "Cut" wordmark (`--font-display`, large), subtitle *"Log in to your tracker"*, then the form: Email `Field`, Password `Field`, `ErrorText` on failure (plain-English message from the API, e.g. wrong credentials or rate-limited), primary `Button` full-width ("Log in" / "Logging in..." while pending — unchanged), and a bottom line *"No account? Register"* linking to `/register`.

### States

- **Loading (submit pending):** button label swaps to "Logging in...", disabled (unchanged).
- **Error:** `ErrorText` above the submit button (unchanged position), plain message.

---

## Register

**Route:** `/register` · **Purpose:** create an account, choose consumer vs. coach.

### Layout

Same card shell as Login. Top to bottom: "Cut" wordmark, subtitle *"Create your account"*, Name/Email/Password `Field`s (password `minLength={8}`, unchanged), a role toggle — two `Button`s side by side, **"I'm training myself"** vs. **"I'm a coach"**, the selected one visually active (`--color-accent` fill or border, unchanged mechanic just restyled), `ErrorText` on failure, primary `Button` full-width ("Create account" / "Creating account..."), bottom line *"Already have an account? Log in"* linking to `/login`.

### Interaction

Submitting navigates to `/onboarding` for a consumer account, `/clients` for a coach account (unchanged routing — coaches skip the training quiz entirely, which is correct, they don't train through the app).

### States

Same pattern as Login: button label swap while pending, `ErrorText` on failure.

---

## Needs-API summary (consolidated)

Everything in this spec is buildable against **existing endpoints** except the two items below — both are flagged inline in their screen sections too, and neither blocks shipping the redesign:

1. **Clients triage row — precise "last log" date.** Current approximation (most recent of last weigh-in / last session date) works from existing data. A fully accurate "last log of any kind" figure needs the coach client-summary endpoint extended to also return the most recent `daily_logs` date. Optional follow-up.
2. **Persisted "set done" state in Train** (only if the owner wants a mid-workout page refresh to remember which sets were checked off). The redesign as specified treats "Done" as ephemeral client-side state purely to trigger the auto-start rest timer — no data is lost (weights/reps still save normally), only the checkmarks reset on reload. Persisting them needs a new `completed` boolean column on `training_log_sets` plus a migration. Optional follow-up.

Everything else — the dual-line trend charts, quick-log deep links, yesterday's-values fill, per-set "number to beat" hints, program-vs-today choice, sessions-this-week counts, and the month consistency calendar — is computed client-side from data the existing API already returns.
