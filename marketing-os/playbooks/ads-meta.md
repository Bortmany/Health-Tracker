# Ads playbook — Meta (Facebook + Instagram)

Platform playbook for campaigns on Meta. The approve-per-campaign contract in `ads/spend-policy.md` governs everything here; every proposal names which playbook it follows.

## Formats used

Reels/Stories vertical video, feed square, and IG feed 4:5 — exact sizes, durations and file limits are the spec table in `assets/README.md`. Build vertical-first; Meta reuses it across placements.

## Policy gotchas

- **Health-claims sensitivity for Cut.** Meta is strict about personal-health advertising: no before/after framing, no implied body judgement ("your problem areas"), no weight-loss timeline claims — ads that make a viewer feel bad about their body get rejected or the account flagged. Cut's own do-not list already forbids most of this; Meta enforces the rest.
- **Special ad categories.** Credit, employment, housing and social-issue ads must be declared as such and lose most targeting options. Anything real-estate-adjacent (Oman Property) likely falls under housing rules — the proposal must say so and plan targeting accordingly.
- Repeated policy rejections damage the ad account itself. When in doubt, the proposal flags the risk for the owner instead of gambling.

## Owner-button checklist (Meta)

The owner, and only the owner, does these inside Meta Ads Manager:

1. Create/confirm the ad account and payment method (row in `ads/accounts.md` first).
2. Create the campaign, ad sets and ads exactly as the approved card says.
3. Set the budget and schedule from the card — never more than the card's cap.
4. Press Publish.
5. Export results as CSV (or grant read-only API access) so agents can monitor.
6. Press every later pause, budget-change or kill button when a proposal card says it's time.

Every proposal names which playbook it follows.
