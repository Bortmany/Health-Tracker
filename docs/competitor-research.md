# Competitor research — what the best fitness apps do, and what Cut should learn

*Researched July 2026 by eight parallel research agents (Sonnet 5), one per competitor, using recent (2024–2026) app-store reviews, Reddit threads, UX teardowns, and pricing pages. This report drives the Cut UI/UX redesign.*

**Apps studied:** MyFitnessPal, MacroFactor, Hevy, Strong, Fitbod, Noom, Caliber, Trainerize — covering all three of Cut's jobs (nutrition, training, coaching).

---

## Part 1 — The patterns that keep winning (adopt these)

These showed up independently across multiple winners. They are the safest bets in the redesign.

1. **One hero action on the home screen.** Fitbod's entire home screen is "today's workout — start it." Caliber leads with one big Strength Score card. The winning dashboards answer *"what should I do right now?"* with one dominant card, not a grid of equal-weight stats. Cut's dashboard currently has a placeholder where "Today's session" should be — the redesign makes that card the hero, wired to the user's actual plan.

2. **Logging speed is the whole game.** The most-loved interactions in the category are all friction-killers: Strong's 3-tap set entry with last session's weight/reps pre-loaded, Hevy's previous-performance number sitting right next to the input field ("the number to beat"), the rest timer that **starts itself** when a set is ticked, MyFitnessPal's Quick Add for repeat items. Every extra tap in a daily-use logger costs retention.

3. **Trend over noise in every chart.** MacroFactor's signature is a pale raw-weight line with a smooth trend line over it — users see direction, not scale anxiety. Noom explicitly tells users daily fluctuation is normal. Cut's weight chart should become a dual-line trend chart with a one-line caption that normalizes fluctuation.

4. **A calm, non-punitive interface.** MacroFactor ships zero red alerts, zero "you failed" states — reviewers single this out. Noom's reassurance micro-copy at vulnerable moments ("Thank you for sharing — that's a hard first step") is the most-respected part of its funnel. This *is* Cut's brand voice ("a knowledgeable friend, not a drill sergeant") — the redesign bakes it into the UI: no red for over-target numbers, encouraging empty states, supportive copy in onboarding.

5. **A generous free tier, with advanced features gated — never core logging.** Hevy, Strong, and Caliber all built their reputations on genuinely usable free tiers. MyFitnessPal's 5-entries-a-day cap is the most hated move in the category's recent history. Cut's free/premium split (4-week vs 52-week plans) already follows the right pattern — keep it that way.

6. **Full, first-class dark mode.** Hevy ships a dark/light/system toggle; Fitbod, Strong, and MacroFactor are dark-forward. MyFitnessPal's half-finished dark mode has been a top complaint since 2020. Cut being dark-*native* is an advantage, not a debt.

7. **Coach triage at a glance.** Trainerize's most-praised mechanic: the client list shows compliance %, last-active date, and auto-tags ("Low compliance") in one screen, so a coach instantly knows who needs attention. Cut's Clients screen should show weight-trend direction + sessions-completed + last-log date per client row.

8. **Visible, explainable progression.** Fitbod's #1 complaint is that its AI picks exercises opaquely and seemingly at random. Cut's plans have explicit written progression rules — the redesign should surface them ("why this week looks like this"), turning transparency into a selling point.

## Part 2 — The mistakes to avoid (they're well documented)

- **Never paywall or cap core daily logging** (MyFitnessPal's defining error).
- **No ads inside logging flows** (MyFitnessPal).
- **No cancellation friction, ever.** Noom paid ~$62M to settle its dark-pattern class action; the FTC now actively enforces this. One-click cancel, no chat-gated cancellation.
- **Never present automation as a human.** Noom's "bot coaches posing as human" backlash is severe. When Cut's dormant AI plan writer wakes, it must be labeled as AI.
- **Don't drown beginners in jargon or data.** MacroFactor's dense, TDEE-jargon onboarding and data-wall dashboard are its main complaints — and its users are *enthusiasts*. Cut's audience is intimidated beginners: simple by default, detail on tap.
- **Don't stagnate visually or functionally.** Strong lost its lead to Hevy by standing still ("pays monthly, sees no updates"); Trainerize is losing to Everfit purely on UI polish and learning curve, not features. Regular visible improvement is retention.
- **Don't fragment pricing into add-ons** (Trainerize's hidden-cost complaint). One flat coach tier.
- **Don't build scoring logic that's brittle at calendar boundaries** (Caliber's week-locked Strength Score fluctuates when a workout moves a day). Any composite score should use rolling windows.

## Part 3 — Gaps Cut can exploit

Feature-level openings the competitors have left (UI-level ones feed the redesign; the rest go to the backlog):

| Gap | Who leaves it open | What Cut does |
|---|---|---|
| Clean, fast, dark, low-clutter logging | MyFitnessPal (cluttered), Trainerize (dated) | The redesign itself — this is the wedge |
| Calendar/streak view of activity | Hevy users explicitly ask; it never ships | A simple month-grid of logged days (Cut already tracks streaks) |
| "Update just today vs. update my program" as an explicit choice | Hevy's known ambiguity | Explicit prompt in Cut's session logger |
| Trend-first weight chart with reassuring framing | Only MacroFactor does it well, and it's paid-only | Dual-line chart, free |
| Transparent progression ("you can see why") | Fitbod's opacity is its top complaint | Show the plan's progression rule in plain English on the plan card |
| One combined app for training + nutrition + coach that stays simple | Caliber is closest but expensive; Trainerize is coach-only and bloated | Cut's existing scope, redesigned to feel unified |
| Compliance-at-a-glance for small coaches | Trainerize does it but is priced/built for studios | Lightweight version on Cut's Clients screen |

Backlog candidates surfaced by research (owner decides, post-redesign): plate/warm-up calculator, auto-starting rest timer, estimated-1RM on PRs, saved/quick-add log shortcuts, client auto-tags ("no log in 7 days"), single composite progress score.

## Part 4 — Visual direction verdict: keep the identity, mature it

**Keep dark + lime.** The evidence is one-sided: the respected apps in this category are dark-forward (Hevy, Strong, Fitbod, MacroFactor), the most-mocked one has a half-finished dark mode (MyFitnessPal), and none of the eight owns a lime/acid accent — Cut's `#c8f135` on near-black is genuinely distinctive in a field of blues (MyFitnessPal, Trainerize) and corals (Noom). Dropping it would trade a recognizable identity for nothing.

**But mature it from "terminal" to "calm athletic":**
- **A real semantic palette around the lime.** Today Cut has one accent doing every job. The redesign adds proper roles — success, warning, danger (used sparingly and never for "you ate too much"), on-accent, chart roles — so the lime reads as *brand*, not as *everything*.
- **Softer hierarchy, more breathing room.** MacroFactor's lesson: data-forward but calm. Larger type scale for hero numbers, more whitespace, fewer equal-weight boxes.
- **The mono-label texture stays, used with restraint** — it's Cut's signature, but it should mark section labels and metadata, not compete with content everywhere.
- **Charts get the MacroFactor treatment**: dual-line trends, no gridlock of grid lines, reassuring captions.
- **Tone in every state**: encouraging empty states ("Nothing logged yet — today's a good day to start"), no red numbers for missed targets, reassurance micro-copy in onboarding.

## Part 5 — What this means for each screen

- **Dashboard** → "Today" screen: hero *Today's session* card (start/continue training, wired to the active plan), weight trend (dual-line) with streak, weekly habit ring, quick-log shortcuts. One glance = what to do now + how it's going.
- **Log** → grouped, collapsible sections with yesterday's values one tap away; injuries/habits appear only when relevant; calmer form density.
- **Train** → session logger gets previous-performance inline per set, auto-start rest timer on set completion, explicit "just today / update program" choice; plan card shows its progression rule in plain English.
- **Progress** → dual-line weight trend, calories trend, PR list; month-grid consistency calendar.
- **Clients (coach)** → triage list: each client row shows weight direction, sessions done this week, last log date; detail view unchanged in function, redesigned in form.
- **Onboarding** → same short quiz (its brevity is correct — Noom's 113 screens prove length is a dark pattern, MacroFactor's jargon proves density scares beginners), plus reassurance micro-copy and a proper "here's your plan" reveal moment.
- **Auth/More** → restyled to the new system; role toggle kept.
- **Navigation** → bottom tabs stay (every winner uses them); Home renamed Today; same 5+coach structure.

---

## Appendix — Per-app briefs

*Condensed from the eight research agents' reports. Sources: app-store review roundups, Reddit (r/loseit, r/MacroFactor, r/personaltraining, etc.), UX teardowns (RevenueCat, Growthwaves, Medium case studies), pricing analyses, and official help centers. Design-language details marked uncertain where sites blocked direct inspection.*

### MyFitnessPal — the cautionary incumbent
**Works:** goal-first quiz ending in a personalized calorie target; barcode scan (loved) ; Quick Add and saved meals; visible logging streak. **Complaints:** free tier capped at 5 food entries/day (the category's most hated change); barcode scan paywalled; ads mid-logging; cluttered UI, core actions buried; dark mode half-finished since 2020; $79.99–99.99/yr framed as "ransom" for once-free features. **Look:** blue, light-first, dense, dated. **Lesson:** instant-value onboarding yes; paywalled/cluttered daily logging never.

### MacroFactor — the data-calm benchmark
**Works:** adaptive TDEE recalculated weekly from real data; dual-line weight chart (pale raw + smooth trend) that kills scale anxiety; verified food database; explicitly non-punitive (no red alerts, no shaming); customizable card dashboard; expenditure chart with uncertainty band; fast, ad-free, 4.8★. **Complaints:** no free tier at all (#1); jargon-dense onboarding overwhelms beginners; dashboard too data-dense for the anxious; weak search; clunky companion workout app. **Look:** black background, per-nutrient accent colors, card-based, "clinical but calm" (hex unverified). **Lesson:** copy the trend chart and the tone; never copy the jargon wall.

### Hevy — the logging gold standard
**Works:** previous performance inline next to the input; auto-starting rest timer with lock-screen live activity; one-tap routine reuse; generous free tier; light social accountability; fast visible dev cycle. **Complaints:** timer bugs/crashes; no clean "edit today vs. edit template" choice; no calendar view (asked for constantly); kg/lb conversion corrupts history. **Look:** dark/light/system toggle, minimal, utilitarian, thumb-first active-workout screen; Pro $23.99/yr or $74.99 lifetime; separate Hevy Coach B2B. **Lesson:** the set-logging loop and timer are the patterns to copy verbatim.

### Strong — the stagnation warning
**Works:** 3-tap set logging with last-session pre-fill; plate + warm-up calculators; auto rest timer; auto-updating 1RM estimates; generous free tier; deliberately no social noise. **Complaints:** never tells you what to do next (no programming layer — the gap Hevy's AI trainer exploited); feature stagnation while charging monthly; lost-workout bugs; thin analytics. **Look:** black/white/gray "spreadsheet" minimalism, now called dated. **Lesson:** a beloved logger still loses if it stops shipping; Cut's plans + coaches are exactly the layer Strong lacked.

### Fitbod — the hero-card pattern
**Works:** "today's workout" as the single hero action; muscle-recovery body heat-map; inline exercise videos/cues; equipment filtering; cleanest logging flow in its class. **Complaints:** algorithm feels random; weak progressive-overload logic; users hand-edit every plan ("why pay?"); trial requires card upfront + cancellation friction; $15.99/mo price jump. **Look:** near-black, single bold accent, hero card dominates home, body-map as signature viz (hex unverified). **Lesson:** copy the hero card; counter the opacity with Cut's visible progression rules; never take a card for a trial.

### Noom — the tone masterclass and the ethics warning
**Works:** psychology-first framing; green/yellow/orange food heuristic instead of moralizing; onboarding that teaches while it asks; reassurance copy at vulnerable moments; weight graph that expects fluctuation. **Complaints:** ~$62M dark-pattern settlement (trial → hard-to-cancel annual); 1,200+ BBB billing complaints; bot coaches posing as human; ~1,200-kcal targets called unsafe; content repetitive by week 6–8; 113-screen funnel read as sunk-cost manipulation. **Look:** light, coral/teal, rounded, friendly illustrations (unverified). **Lesson:** adopt the voice, refuse the machinery.

### Caliber — the closest analog
**Works:** genuinely useful free tier; Strength Score — one composite number atop the dashboard; nutrition delivered as coach-set targets, not a second app; async video check-ins reviewing real logged data; unified Progress hub (training + nutrition + body + habits in one place). **Complaints:** poor offline handling; week-boundary score fluctuation; $19/mo → $200+/mo tier cliff; small chat frictions. **Look:** dashboard-first, card-based, one hero score over many small charts (dark mode unconfirmed). **Lesson:** this is the shape Cut already has — training + nutrition + coach in one app; the hero-score and unified-progress patterns transfer directly.

### Trainerize — the coach-side benchmark and bloat warning
**Works:** auto compliance tags (Low/High) from scheduled-vs-done; color-coded insights dashboard; client list with recency + compliance + tags in one view; messaging automation; deep program delivery. **Complaints:** dated cluttered UI losing to Everfit's polish; steep learning curve; buggy slow client app; hidden add-on pricing; confused less-technical clients. **Look:** corporate blue, feature-dense, functional-not-polished. **Lesson:** copy the triage row for Cut's Clients screen; keep everything else radically simpler — Cut's coaches are individuals, not studios.
