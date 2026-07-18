# A/B experiment registry

Every paid-ads experiment gets a row here before it launches and keeps it forever. This is how the system learns what actually works instead of re-guessing every month.

| ID | Brand | Hypothesis | Variable tested | Variants | Platform | Start | Min spend before judging | Outcome | Decision |
|---|---|---|---|---|---|---|---|---|---|

## Rules

- **One variable per experiment.** If two things changed, nobody knows which one worked.
- **Never judged before min spend.** The proposal sets the number; until spend reaches it, the outcome column stays empty — tiny samples lie.
- **Losers are recorded, never deleted.** A failed variant is paid-for knowledge; deleting it means paying for it again later.
