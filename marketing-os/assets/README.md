# assets/ — generated ad media, and how it's organized

Every video or image generated for paid ads lands here before the owner ever sees a platform. This file is the convention; the ads playbooks and `ad-creative-producer` follow it.

## Layout

```
assets/ads/<brand>/<campaign-slug>/
```

One folder per campaign, under the brand it belongs to.

## Naming

```
<brand>-<campaign>-<experimentID>-<variant>-<aspect>.<ext>
```

Example: `cut-launch-EXP001-A-9x16.mp4` — Cut brand, launch campaign, experiment EXP001 (from `ads/experiments.md`), variant A, vertical video. A filename alone tells you exactly what a file is and which experiment row it belongs to.

## Platform spec table

| Aspect | Size | Where it runs | Notes |
|---|---|---|---|
| 9:16 | 1080x1920 | Reels/Stories/TikTok | Video: keep under ~60s (TikTok ads ideally 9–15s); check each platform's current file-size limit before export |
| 1:1 | 1080x1080 | Feeds (FB/IG/X) | Image or short video; safest all-round crop |
| 16:9 | 1920x1080 | YouTube/in-stream | In-stream video; front-load the message — skippable after 5s |
| 4:5 | 1080x1350 | IG feed | Taller feed crop; more screen than 1:1 on phones |

Platforms move their duration and size limits — confirm the current limit in the platform's own spec page at export time rather than trusting this table's notes forever.

## Brand-safety checklist (every asset, before it goes on a card)

- Brand voice and do-not list respected (read the brand profile in `brands/` first — as always).
- No claims we can't back up.
- **Cut:** no body-shaming, no medical claims, no timeline claims ("lose X in Y weeks").
- **TradeOS:** no promised returns, ever.
- Arabic checked by actually rendering it — never assumed correct from the text file. RTL breaks silently.
- AI-media labeling applied where the platform requires it (TikTok does — see `playbooks/ads-tiktok.md`).

Nothing in `assets/` reaches a platform except through the owner.
