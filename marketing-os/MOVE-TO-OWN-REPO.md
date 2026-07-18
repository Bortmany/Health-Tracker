# Moving marketing-os to its own repository — the runbook

**Status: waiting on one owner step.** The move was approved on 18 July 2026, but the
GitHub connection Claude uses is not allowed to create new repositories (it can only
work with existing ones). Everything else is prepared — the move takes one session
once the repo exists.

## The one step only you can do

Create an empty repository on GitHub: go to github.com → New repository →
name it exactly **marketing-os** under your account (bortmany), set it **Private**,
and do NOT initialize it with a README. Two clicks, done.

## Then tell any Claude session (with the Agents repo loaded):

"Add the repo bortmany/marketing-os and finish the marketing-os move per the runbook."

The session will then:
1. Add + clone the new repo into the session.
2. Move everything in `Health-Tracker/marketing-os/` (except this runbook) to the new
   repo's root, and add a README noting: sessions that run marketing agents must
   include BOTH the `Agents` repo (the agent definitions) and this repo (the state).
3. Push the import to the new repo's `main`.
4. Delete the `marketing-os/` folder from Health-Tracker and remove any mention of it
   from Health-Tracker's docs.
5. Sweep every live reference of `marketing-OS/` (old casing) and
   `Health-Tracker/marketing-os/` to the new repo name `marketing-os/` across:
   the Agents repo (`CLAUDE.md`, `docs/architecture.md`, `docs/backlog.md`,
   `docs/apps.md` if mentioned, and every agent file whose "Repo scope" line or body
   references it) and `Dukkani/docs/pricing-and-services.md`. Dated audit reports are
   history and stay untouched.
6. Mark the "move to own repo" step done in `docs/setup.md`, run
   `node scripts/check-agents.mjs` in the Agents repo, then commit and push every
   touched repo.

## Why move at all

marketing-os is a whole business system (brand truth, playbooks, ads policy, the
future money ledger) living inside the Health-Tracker product repo. Its own repo means
marketing sessions don't need to load an unrelated product's code, and the
`marketing-OS` vs `marketing-os` naming confusion dies for good.
