# Ads playbook — Google

Platform playbook for campaigns on Google Ads. The approve-per-campaign contract in `ads/spend-policy.md` governs everything here; every proposal names which playbook it follows.

## Formats used

Search ads are text-first (no creative files). Video/display use the 16:9 and square specs in the table in `assets/README.md`.

## Policy gotchas

- **Search-intent keywords first.** Google's edge is catching people who are already looking ("workout plan for beginners", not "fitness"). Proposals start from a concrete keyword list with intent behind it — broad awareness plays belong on other platforms.
- **Caution with auto-expanding campaign types.** Campaign types like Performance Max and broad-match-heavy setups expand where the money goes on their own — which fights our approve-per-campaign model. Proposals default to tightly-scoped campaign types (exact/phrase match, defined placements) and must flag it explicitly if they ever suggest an auto-expanding type.
- Health-adjacent wording rules apply to Cut here too: no guaranteed-results or timeline claims in ad copy.

## Owner-button checklist (Google)

The owner, and only the owner, does these inside Google Ads:

1. Create/confirm the ad account and payment method (row in `ads/accounts.md` first).
2. Create the campaign, ad groups, keywords and ads exactly as the approved card says — same match types, same negative keywords.
3. Set the budget and schedule from the card — never more than the card's cap.
4. Press Publish/Enable.
5. Export results as CSV (or grant read-only API access) so agents can monitor.
6. Press every later pause, budget-change or kill button when a proposal card says it's time.

Every proposal names which playbook it follows.
