# Marketing OS

A reusable, agent-run marketing and business-operations system. It plans, writes, designs and monitors — **but a human approves everything before it goes public, and nothing here ever spends money on its own.**

Currently serving: **Cut** (fat-loss & training tracker) and **TradeOS** (pre-product, listening mode).

## How it works in one paragraph

Agents run on a schedule inside Claude Code sessions on this repo. They read the brand profiles in `brands/`, follow the playbooks in `playbooks/`, and put every piece of work — social posts, Reddit replies, emails, ad proposals — as a draft card on the **Marketing Queue board in Notion**. The owner drags cards to *Approved*; only then does the Publisher push them out (Instagram + X via the scheduler tool, Reddit via the Reddit API). Every Friday the Analyst emails a plain-English report.

## The team

| Agent | Job | Status |
|---|---|---|
| `strategist` | 2-week content calendars per brand | active |
| `copywriter` | Captions, tweets, threads in each brand's voice | active |
| `designer` | Canva graphics attached to draft cards | active |
| `reddit-scout` | Finds relevant communities & conversations across ALL of Reddit, drafts helpful disclosed replies | active |
| `publisher` | Moves Approved cards into the scheduler / posts replies | active (needs scheduler account) |
| `email-marketer` | Welcome emails, newsletters — drafts only | active |
| `analyst` | Friday report: numbers + suggestions + the activation switchboard | active |
| `ads-manager` | Ad campaign proposals | **dormant** — needs ad account + budget |
| `ops-watchdog` | Is the live app up and healthy? Alerts only on problems | active once Cut's live URL is confirmed |
| `support-agent` | Triages support email, drafts replies, files bugs | active once a support address exists |
| `feedback-curator` | Turns user feedback into ranked feature ideas | **dormant** |
| `maintenance` | Monthly dependency/security updates as ready-to-merge changes | **dormant** |
| `competitor-watch` | Monthly competitor digest | **dormant** |
| `billing-ops` | Failed-payment recovery, revenue summary | **dormant** — needs Stripe live |
| `seo-writer` | Blog articles for long-term free Google traffic | **dormant** |

Dormant agents wake up when their written condition in `playbooks/activation-checklist.md` is met — the Friday report checks the conditions every week and tells the owner when it's time.

## Hard rules (also in CLAUDE.md — these are non-negotiable)

1. Nothing publishes without the owner moving the card to **Approved** in Notion.
2. No agent ever spends money. Ads are proposals until the owner funds and approves each campaign.
3. Reddit activity is honest: helpful first, affiliation disclosed, each community's rules respected.
4. No end-user personal data is ever used in marketing.

## Adding a new project

Copy `brands/_template.md` to `brands/<name>.md`, fill it in, add the project's accounts to the scheduler. That's the whole integration.
