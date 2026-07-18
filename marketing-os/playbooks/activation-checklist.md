# Activation checklist — when each dormant agent turns on

**How this works:** every Thursday the `analyst` checks each condition below against reality and reports MET / CLOSE / NOT YET in the "activation switchboard" section of the weekly report. When a condition is MET, the report recommends flipping the agent on and says what it will cost the owner in minutes per week. **The owner says yes; nothing self-activates.** Conditions are deliberately measurable so there's no judgement call to argue about.

| Agent | Turns on when… | Why that moment | Owner cost when on |
|---|---|---|---|
| `ops-watchdog` | The Cut Render URL is confirmed live (owner opens it once and says "that's it") | Pointless before there's a site to watch; critical the day there is | ~0 — only hear from it when something breaks |
| `support-agent` | A support email address exists AND the first real user email arrives | No inbox, nothing to triage | ~5 min/day approving reply drafts (scales with users) |
| `publisher` (full mode) | Publer + Reddit accounts connected (the 25-min setup) | Until then it runs prepare-only | 0 extra |
| `feedback-curator` (#4) | **25 total signups** OR the first piece of unsolicited user feedback, whichever first | Below that, "patterns" are noise — one person is an anecdote | ~5 min/month reading the ranked list |
| `maintenance` (#5) | Any app live and stable for **two weeks** | Updating dependencies during launch churn multiplies risk; on a stable app it's pure health | ~10 min/month reading + merging the prepared update |
| `competitor-watch` (#6) | Marketing has run **4 full weeks** (4 Thursday reports exist) | Needs our own baseline first, or the digest has no "so what for us" | ~10 min/month reading the digest |
| `billing-ops` (#7) | Stripe env vars set on Render (Premium is actually purchasable) | Nothing to recover before real payments | ~5 min/week approving recovery drafts |
| `seo-writer` (#8) | **100 total signups** AND 4 consecutive weeks without a product-breaking bug | SEO pays off in months — pointless before product-market signal; also needs a blog section built (small dev task, flagged then) | ~20 min per article to review |
| `ads-manager` | First row exists in `ads/accounts.md` with an owner-set monthly cap | Money never moves on inference — the registry row IS the owner's written permission | Per-campaign approval: approve the card AND press the platform buttons |
| `ad-creative-producer` | Higgsfield tools connected OR first row in `ads/accounts.md` | Ad media before there's anywhere to run it (or tools to make it) is wasted work; joins `marketing-director`'s crew at wake | ~0 extra — its output rides the normal card approvals |
| `backup-warden` | First live URL confirmed in `Agents/docs/apps.md` | Nothing needs backing up until something is live; reports straight to the owner | ~0 — only hear from it when something's wrong |
| `app-store-publisher` | Apple and/or Google developer accounts exist | The accounts cost real money and are the owner's decision — store work is impossible before them; reports straight to the owner | Review time per release — the owner presses the store buttons |
| `pricing-analyst` | The owner asks, or the first monetization decision arrives — client billing, a paid tier, a payment-provider choice | Pricing analysis before a real decision is homework nobody uses; reports straight to the owner | ~10 min reading per analysis |
| TradeOS promotional track | Owner delivers the one-paragraph product description | Can't market an undefined product | — |

**Changing a condition:** owner edits this file (or asks). Agents follow whatever is written here — this file is the switchboard's wiring.
