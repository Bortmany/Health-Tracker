# Marketing OS — System Design

*A reusable publishing, advertising, marketing and sales system, run by Claude agents, that works for Cut today and any future project (TradeOS next) by adding one config file.*

**Status: design for review — nothing has been built yet.** Once you approve (or adjust) this, the build starts.

---

## 1. The idea in one paragraph

A separate repo called **`marketing-os`** holds a team of marketing agents and one "brand profile" per project. On a schedule, the agents plan content, write posts, design graphics in Canva, and drop everything as draft cards into a **Notion board**. Nothing goes public until **you** drag a card to "Approved" — then the system publishes it to Instagram and X through a scheduler tool, watches how it performs, and sends you a **plain-English report every Friday**. Adding a new project later (TradeOS, or anything else) means writing one new brand profile file — the whole machine is shared.

```
 Agents plan & draft  →  Notion board (YOU approve)  →  Scheduler posts it  →  Analyst reports Fridays
```

---

## 2. The agent team

Same pattern as the six agents that built Cut — each has one job and a written playbook:

| Agent | Job | Runs |
|---|---|---|
| **Strategist** | Turns each brand profile into a 2-week content calendar: topics, formats, posting times, what to promote | Every other Monday |
| **Copywriter** | Writes the actual captions, tweets and threads in each project's voice | Daily batch |
| **Designer** | Creates the graphics in Canva (quote cards, tip carousels, feature screenshots) and attaches them to the draft cards | Daily batch, after Copywriter |
| **Publisher** | Takes cards you've approved in Notion and loads them into the scheduler with the right date/time | Daily check |
| **Reddit scout** | Watches the communities where your future users hang out (r/loseit, r/Fitness, r/xxfitness, coach subs for Cut; trading subs for TradeOS) for threads asking for what your product does, or mentioning it. Drafts a genuinely helpful, human-sounding reply for each opportunity — advice first, app mentioned with honest disclosure ("I built this") — into the same approval queue | Daily scan |
| **Email marketer** | Drafts the welcome email for new Cut signups, plus a periodic newsletter — also drafts-first, into the same board | Weekly |
| **Ads manager** | Designs ad campaigns (audience, budget, creative) as *proposals only* — dormant until you give it an ad account and budget, exactly like the Stripe/AI switches in Cut | On request |
| **Analyst** | Pulls the numbers — reach, likes, follower growth, link clicks, and Cut signups — and writes the Friday report in plain English with 2–3 suggestions | Fridays |

**How they wake up:** scheduled routines (the same mechanism as a calendar reminder, but it starts a Claude session in the marketing repo). You can also poke the system any time by just asking, e.g. *"draft a post about the new streaks feature."*

---

## 3. Brand profiles — the reusable part

One folder per project inside `marketing-os/brands/`. Everything project-specific lives here; the agents and playbooks are shared.

**`brands/cut/`** (ready to fill in from day one)
- **What it is:** fat-loss & training tracker for people who don't know what to train, plus their coaches
- **Audience:** beginners who want to lose fat without guesswork; coaches with clients
- **Channels:** Instagram (tips, before/after style graphics, feature highlights) + X (short tips, build-in-public updates) + Reddit (helpful replies in fat-loss and coaching communities)
- **Voice:** encouraging, plain-English, zero fitness-bro jargon — same tone as the app
- **Content pillars:** training tips · nutrition simplified · app features · streaks & habit science · coach corner
- **Goal:** app signups (link in bio → the Render URL)

**`brands/tradeos/`** (starts lean — the repo is currently empty, so there's no product to screenshot yet)
- **Strategy while pre-product:** "build-in-public" on X — progress updates, lessons, audience-building, collecting a waitlist — plus Reddit monitoring of trading communities to learn what people complain about and want (pure listening at first; that feedback shapes the product itself). Instagram waits until there's something visual to show.
- **Needs from you:** one paragraph on what TradeOS actually is and who it's for. That's the only blocker for this profile.

---

## 4. The approval queue (Notion)

One Notion board called **Marketing Queue**, shared across projects, filtered by project tag. Each card is one piece of content:

> **Card:** the finished graphic · the caption/text · platform (IG, X or Reddit) · project (Cut/TradeOS) · proposed date & time · a one-line "why this post"

Reddit cards look slightly different: they show the thread being replied to, the drafted reply, and why the Scout flagged it — approve and the reply goes up.

Columns: **Drafted → Awaiting your approval → Approved → Scheduled → Published**. You review from your phone: drag to Approved (or leave a comment like "less salesy" and the Copywriter redoes it next run). **The hard rule: agents can never move a card into Approved. Only you.** Same rule, doubled, for anything that costs money.

---

## 5. Tools and monthly cost

| Tool | For | Cost |
|---|---|---|
| Notion | Approval board + content calendar | Free (already connected) |
| Canva | All graphics | Free tier (already connected) |
| **Publer** (or Buffer) | Actually posting to Instagram + X on schedule | **~$12–24/mo** — the only new paid tool |
| Reddit API | The Scout's monitoring + posting approved replies | Free at this scale |
| Brevo (or similar) | Sending welcome emails/newsletter when Cut is live | Free tier (300 emails/day) |
| Gmail | Friday report lands in your inbox | Already connected |

**Total: roughly $12–24/month** — well inside the $30–100 you set. Paid ads stay at $0 until you flip that switch.

One-time setup on your side (15–30 min, I'll give click-by-click steps): create the Publer account and connect **Cut's Instagram** (needs to be a free Business/Creator account), **Cut's X account**, and **TradeOS's X account**, then hand me the API key.

---

## 6. A normal week, once it's running

- **Mon (every 2nd):** Strategist posts the next 2-week calendar to Notion for a glance-over
- **Daily, morning:** Copywriter + Designer add 1–3 draft cards; Reddit Scout adds any reply opportunities it found; Publisher schedules anything you approved
- **You, whenever:** 5 minutes on the Notion board — approve, comment, or ignore
- **Fri:** Analyst's report in your inbox: what went out, what performed, follower/signup numbers, 2–3 suggestions
- **Anytime:** message the system directly for one-off asks ("announce the coach feature this week")

Posting pace to start: ~4–5/week on Cut's Instagram, ~5–7/week on each X account. If approvals pile up, we lower the pace — the system adapts to you, not the other way round.

---

## 7. Safety rails

1. **Nothing publishes without your approval** — enforced by the workflow (Publisher only sees the Approved column), not by trust.
2. **Money is double-locked** — the Ads manager produces proposals only; live campaigns need an ad account, a budget you set, and per-campaign approval.
3. **Reddit is honest by design** — replies are helpful-first, disclose that it's your app, and respect each community's self-promo rules, with most of the account's activity being genuinely useful (non-promotional) contributions. This isn't just ethics: undisclosed shilling is the fastest way to get an account banned and a product name blacklisted on Reddit. Transparent "I built this" replies are what actually works there.
4. **No customer data in marketing** — the system never touches Cut's user database beyond an anonymous signup count.
5. **Everything is a file in git** — profiles, playbooks, calendars. You can read any of it, and any change is tracked.

---

## 8. Later, when you're ready (designed now, switched on later)

- **Paid ads:** Meta + Google campaigns, starting ~$5–10/day test budgets — needs ad accounts + budget green-light
- **TikTok:** scripts and shot-lists drafted for you to film — when you want video
- **Sales funnel for Cut Premium:** free-trial email sequence, once Stripe is live
- **App-store pages:** copy + screenshots, once the native apps happen (`docs/mobile.md`)

---

## 9. Beyond marketing — other things worth automating

Same pattern (agents + schedules + your approval where it matters), pointed at running the business instead of promoting it. Ranked by how much time/risk each saves you:

| # | Automation | What it does |
|---|---|---|
| 1 | **Ops watchdog** | Checks the live Cut site every few hours — is it up, can a test account log in, did the last deploy work? You get a message only when something breaks, ideally before users notice. |
| 2 | **Support inbox** | A support email address the system triages: drafts a plain-English reply for you to approve, answers FAQs, and flags real bugs straight into the dev backlog. |
| 3 | **Weekly business report** | One Friday email combining everything: signups, active users, streak/retention numbers, revenue (once Stripe is on), and the marketing stats — the whole business on one page. |
| 4 | **Feedback loop** | Collects user feedback (in-app form, emails, app-store reviews later, and what the Reddit Scout overhears) into a digest, spots patterns ("5 people asked for barcode scanning"), and files them as ranked feature ideas. |
| 5 | **Maintenance PRs** | Monthly: update dependencies, run security checks, run the full test suite, and prepare the fix as a ready-to-merge change. Keeps the app healthy with zero effort from you. |
| 6 | **Competitor watch** | Monthly digest: what MyFitnessPal/MacroFactor-type apps (and TradeOS's competitors) shipped and charge, and what users complain about — free product research. |
| 7 | **Billing ops** *(once Stripe is live)* | Failed-payment recovery emails, cancellation exit-question, monthly revenue summary. |
| 8 | **Blog/SEO engine** *(later)* | Drafts helpful articles ("beginner cutting guide") published on the site so Google sends free traffic long-term — the slowest but most compounding channel. |

Suggested rollout: **1–3 alongside the marketing build** (the watchdog matters the moment real users arrive), 4–5 shortly after, 6–8 when live and stable.

---

## 10. What I need from you to start building

1. **A green light on this design** (or your edits) — including which of the section-9 automations to include in round one
2. **A one-paragraph description of TradeOS** — what it is, who it's for
3. During the build, ~25 minutes for account setup: Publer signup, connecting the IG/X accounts, one Reddit account per project, and confirming the Notion board looks right

Then the build order is: repo + brand profiles + playbooks → Notion board → first batch of 10 draft posts and Reddit replies for your approval (before any scheduler is even connected, so you can judge quality risk-free) → scheduler + Reddit hookup → routines + Friday report → the ops automations you picked from section 9.
