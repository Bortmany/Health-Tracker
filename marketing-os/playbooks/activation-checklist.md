# Activation checklist — when each dormant agent turns on

**How this works:** every Friday the `analyst` checks each condition below against reality and reports MET / CLOSE / NOT YET in the "activation switchboard" section of the weekly report. When a condition is MET, the report recommends flipping the agent on and says what it will cost the owner in minutes per week. **The owner says yes; nothing self-activates.** Conditions are deliberately measurable so there's no judgement call to argue about.

| Agent | Turns on when… | Why that moment | Owner cost when on |
|---|---|---|---|
| `ops-watchdog` | The Cut Render URL is confirmed live (owner opens it once and says "that's it") | Pointless before there's a site to watch; critical the day there is | ~0 — only hear from it when something breaks |
| `support-agent` | A support email address exists AND the first real user email arrives | No inbox, nothing to triage | ~5 min/day approving reply drafts (scales with users) |
| `publisher` | **The business is up and running** (owner's call) AND the owner subscribes to Publer Business (~$21/mo), connects the social accounts (Instagram, X, Facebook), and generates the API key | Publishing before there's a running business wastes money and attention; Publer's built-in "pending approval" state also gives the owner a final tap-to-approve on every single post | ~5 min/day approving queued posts in the Publer app |
| `feedback-curator` (#4) | **25 total signups** OR the first piece of unsolicited user feedback, whichever first | Below that, "patterns" are noise — one person is an anecdote | ~5 min/month reading the ranked list |
| `maintenance` (#5) | Cut live for **2 weeks with no deploy rollbacks** | Updating dependencies during launch churn multiplies risk; on a stable app it's pure health | ~10 min/month reading + merging the prepared update |
| `competitor-watch` (#6) | Marketing has run **4 full weeks** (4 Friday reports exist) | Needs our own baseline first, or the digest has no "so what for us" | ~10 min/month reading the digest |
| `billing-ops` (#7) | Stripe env vars set on Render (Premium is actually purchasable) | Nothing to recover before real payments | ~5 min/week approving recovery drafts |
| `seo-writer` (#8) | **100 total signups** AND 4 consecutive weeks without a product-breaking bug | SEO pays off in months — pointless before product-market signal; also needs a blog section built (small dev task, flagged then) | ~20 min per article to review |
| `ads-manager` | Owner provides ad account + explicit monthly budget | Money never moves on inference | Per-campaign approval |
| TradeOS promotional track | Owner delivers the one-paragraph product description | Can't market an undefined product | — |

**Changing a condition:** owner edits this file (or asks). Agents follow whatever is written here — this file is the switchboard's wiring.
