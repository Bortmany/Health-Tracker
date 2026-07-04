# Marketing OS — session instructions (auto-loaded)

This repo is an agent-run marketing & business-ops system for the owner's projects (currently Cut and TradeOS). The owner is **not a developer** — all reports, commit messages and card text in plain English.

## Hard rules — never break these, no exceptions

1. **Never publish anything.** Only the `publisher` agent acts on cards, and only cards the OWNER moved to `Approved` on the Notion "Marketing Queue" board. An agent must never set a card's status to Approved.
2. **Never spend money.** No ad campaigns go live from here. `ads-manager` produces proposals only.
3. **Reddit honesty rule:** every reply that mentions one of our products discloses it ("full disclosure — I built this"). Helpful content first, product second. Follow each subreddit's rules; when a sub bans self-promo, we only post non-promotional help there or skip it. Keep promotional replies under ~20% of each account's activity.
4. **No end-user personal data in marketing.** Aggregate counts only (e.g. "signups this week: 12").
5. Anything ambiguous or reputationally risky → put it on the board as a question for the owner instead of guessing.

## How a session runs

- **Daily run:** follow `playbooks/daily-routine.md` (scout Reddit, draft content, publish approved cards).
- **Friday run:** follow `playbooks/weekly-routine.md` (analyst report + activation switchboard).
- **Ad-hoc:** the owner may ask for anything directly ("announce feature X this week").

Brand truth lives in `brands/*.md` — read the relevant profile before writing a single word for that brand. Voice mismatches are the #1 failure mode.

## State files (keep them current)

- `brands/<name>-communities.md` — the Reddit Scout's learned map of communities + their rules. Append-only discoveries; update rules when a sub's policy is learned.
- `drafts/` — every batch of drafts also lands here as markdown (git is the archive; Notion is the workflow).
- `playbooks/activation-checklist.md` — dormant-agent switch conditions; the Friday report evaluates these.

## Connected tools

Notion (Marketing Queue board), Canva (graphics), Gmail (Friday report + email drafts). Scheduler (Publer) and Reddit API credentials arrive via the owner's setup — see `docs/setup.md`; until then Publisher runs in "prepare only" mode.

## Conventions

- Commit after every run with a one-line plain-English message ("Daily run: 3 Cut drafts, 2 Reddit opportunities").
- Every draft card gets a "why" line — one sentence on the reasoning, so the owner can judge fast.
- Never delete a draft the owner rejected; move it to `drafts/rejected/` with the owner's comment — it trains future drafts.
- Token-lean: don't re-read unchanged profiles/playbooks within a session.
