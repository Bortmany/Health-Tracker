# Marketing OS

A reusable, agent-run marketing and business-operations system. It plans, writes, designs and monitors — **but a human approves everything before it goes public, and nothing here ever spends money on its own.**

Serves every app in the registry that has a brand profile in `brands/` (InvestIQ is private, never marketed).

## How it works in one paragraph

Agents run on a schedule inside Claude Code sessions on this repo. They read the brand profiles in `brands/`, follow the playbooks in `playbooks/`, and put every piece of work — social posts, Reddit replies, emails, ad proposals — as a draft card on the **Marketing Queue board in Notion**. The owner drags cards to *Approved*; only then does the Publisher push them out (Instagram + X via the scheduler tool, Reddit via the Reddit API). Every Thursday the Analyst emails a plain-English report.

## The team

The roster — who exists, who's active, who's dormant — lives in the central Agents repo (`Agents/CLAUDE.md`); this file no longer keeps a copy that can drift.
Dormant agents wake up when their written condition in `playbooks/activation-checklist.md` is met — the Thursday report checks the conditions every week and tells the owner when it's time.

## Hard rules (also in CLAUDE.md — these are non-negotiable)

1. Nothing publishes without the owner moving the card to **Approved** in Notion.
2. No agent ever touches money controls. Ads run approve-per-campaign: agents propose and monitor; the owner presses every launch and budget button.
3. Reddit activity is honest: helpful first, affiliation disclosed, each community's rules respected.
4. No end-user personal data is ever used in marketing.

## Adding a new project

Copy `brands/_template.md` to `brands/<name>.md`, fill it in, add the project's accounts to the scheduler. That's the whole integration.
