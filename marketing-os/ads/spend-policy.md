# Spend policy — the approve-per-campaign contract

This is the plain-English contract for how paid ads work here. It sits under hard rule 2 in `CLAUDE.md` (**never touch money controls**) and caps what agents may even *propose*. If anything here conflicts with a proposal, the proposal loses.

## The flow

1. **Proposal.** An agent designs a complete campaign — audience, creatives, budget, kill threshold — as a card on the Notion board (Type: Campaign).
2. **Owner approves twice.** The owner approves the Notion card AND presses the buttons inside the ad platform themselves. Dragging the card to Approved means "I will press the platform buttons exactly as the card says" — the card never presses anything.
3. **Monitoring.** Once the owner has launched, agents watch the campaign from whatever the access mode allows (CSV exports the owner pastes, screenshots, or a read-only API key) and record what they see.
4. **Adjust/kill proposals.** When the numbers say change something or stop, agents propose it as a new card — and the owner presses the platform buttons again. Every change, pause and kill is the owner's finger on the button.

## Caps

- **Global monthly cap across all platforms:** `[OWNER: set]`
- **Per-campaign default cap:** `[OWNER: set]` (a proposal may ask for more, but must say so in bold and why)
- **First-campaign doctrine:** the first campaign for any brand is a small test — 5–10 dollars/day, one platform, one variable — and nobody judges the result until about 50 dollars have been spent. Tiny samples lie.

## Kill thresholds

- Every campaign proposal states its kill threshold BEFORE launch ("propose killing this if X by Y spend") — never invented after the fact.
- Standing propose-kill triggers, always on regardless of the per-campaign threshold:
  - spend is pacing at twice the campaign's cap;
  - zero conversions after a stated spend (the proposal names the number).
- A kill is still a *proposal* — the owner presses pause. Agents flag it loudly and immediately.

## The spend ledger

The ledger lives in `ads/spend-ledger.md` — one monthly table: date | platform | campaign | spend (from owner export) | result metric | note. Agents record only what exports or read-only access actually show; no estimated or remembered numbers, ever. Once `bookkeeper` is awake, it consumes the monthly totals from this ledger for the whole-business P&L.
