# Owner setup guide (~25 minutes, one time)

## Where and how this system runs (plain English)

The agents are not a server you host — they run as **Claude Code cloud sessions on this repo**, the same way our dev sessions run. A schedule (a "routine") starts a session automatically — every morning for the daily run, every Friday for the report — the session follows the playbooks, writes to Notion/Canva/Gmail through your connected apps, commits its work here, and shuts down. There is nothing to keep running, no hosting bill; it runs on your Claude subscription. You interact from your phone: approve cards in Notion, read the Friday email, and message Claude any time for one-off asks. Claude sets up the schedules for you once the accounts below are connected — you never touch cron or code.

## What to set up (in order)

### 1. Create the GitHub repo (2 min)
github.com → New repository → name `marketing-os`, Private, "Add a README" → Create. Then tell Claude "the repo exists" and it moves this system in.

### 2. Social accounts (10 min)
- **Cut Instagram:** create the account, then in Instagram settings switch it to a free **Professional (Creator or Business)** account — required for scheduled posting.
- **Cut X account** and (optional now) **TradeOS X account.**
- **Reddit:** one fresh account per project (e.g. u/cut_app). Note: new Reddit accounts need some genuine activity before subs trust them — the Scout's "helpful-only, no product mention" reply drafts exist exactly to build that up honestly.

### 3. Publer (~10 min, ~$12/mo)
publer.com → sign up → connect the Instagram and X accounts → Settings → API → copy the API key → give it to Claude (it goes into the session environment as `PUBLER_API_KEY`, never into this repo).

### 4. Reddit API (5 min)
reddit.com/prefs/apps (logged in as the product account) → create app → type "script" → give Claude the client id + secret (stored as env vars `REDDIT_CLIENT_ID` / `REDDIT_SECRET` / `REDDIT_USER` / `REDDIT_PASS`).

### 5. Confirm the Notion board
Claude creates the **Marketing Queue** board in your Notion. Open it once, check you can drag cards between columns on your phone. Remember: dragging to **Approved** is the act of publishing — treat that column as the "send" button.

### 6. Later, when relevant
- **Brevo** (free) when Cut goes live — for welcome emails.
- **Support address** — e.g. a `support@` alias or a Gmail label; activates the support agent.
- **Meta/Google ad accounts + a budget** — wakes the ads manager.

## Secrets policy
API keys live in the session environment settings, never committed to this repo. If a key ever appears in a file here, that's a bug — tell Claude to rotate it.
