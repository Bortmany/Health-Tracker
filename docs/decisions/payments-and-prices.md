# Cut — payments, prices and plumbing: decisions for the owner

Written 30 Sep 2026 for the October alignment round (branch `align-2026-10`). Research by three researcher agents and one code sweep. Sources were checked on 30 Sep 2026.

## Owner's answers

Answered 30 Sep 2026. The owner's words: "1 research other option if nothing possible then paypal 2 coach set their own price 3 use your suggestion 4 keep 5 aprove"

1. **Provider:** look for another option first, and use PayPal if nothing better is possible. A second research pass runs now; the result gets added below before Step 5.
2. **Prices:** each coach sets their own student monthly price, with a safety floor of $10 so fees are always covered. Everything else uses the suggestions: $49 coach startup fee, 15% commission (10% once a coach has 20+ students), and $12.99 a month or $89.99 a year for the solo AI plan.
3. **Photos and email:** the suggestions. Photos go in a Railway Storage Bucket, email goes through Resend, and all seven small questions in section 4 take their suggested defaults.
4. **"Calories burned" is KEPT** (screens, Apple Health sync and export). Step 8 will drop only the two nutrition tables, not `daily_logs.calories`.
5. **All three specs are approved.**

---

## 1. Who handles the money? (the big one)

**Recommendation: Stripe, through a US company (an LLC) that Stripe Atlas sets up for you, with Stripe Connect paying coaches automatically.** It is the only option that does all four jobs: coach startup fee, student monthly, solo AI plan, and automatic coach payouts. Stripe also checks every coach's identity and bank details for you.

**Fallback, or a bridge while the LLC is being set up: PayPal Business in your own name.** PayPal Subscriptions collects the money and PayPal Payouts pays coaches into their PayPal accounts. It works from Oman today with no company, but it is clunkier. PayPal does not work out or handle sales tax or VAT for you.

**Paddle has to go.** Paddle's rules ban "any product or service that provides advice (e.g., weight loss, muscle building)", "coaching" and "digital marketplaces" ([Paddle's banned list](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle)). Paddle could turn down even the solo AI plan, and it cannot pay coaches at all. Lemon Squeezy and Polar ban marketplaces too.

**The Oman question, plainly**

| Provider | Can you sign up from Oman? | Pays coaches? | Source |
|---|---|---|---|
| Stripe | **No** in your own name. Yes through a US LLC (Atlas: $500 once, then $100 a year) | Yes | [stripe.com/global](https://stripe.com/global), [Atlas](https://stripe.com/atlas) |
| PayPal | **Yes** ("Oman: Send, receive, and withdraw") | Yes | [PayPal Payouts countries](https://developer.paypal.com/payouts/supported-features) |
| Paddle | Yes | No, and it bans coaching | [Paddle countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) |
| Lemon Squeezy / Polar | Yes | No, they ban marketplaces | [Lemon Squeezy](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products), [Polar](https://polar.sh/docs/merchant-of-record/acceptable-use) |
| Wise | No | — | [Wise help](https://wise.com/help/articles/2813542/where-do-i-need-to-live-to-hold-money-with-wise) |

**Fees (Stripe):**
- On each payment: 2.9% + 30¢, plus 1.5% for foreign cards and 0.7% for subscriptions.
- For each coach paid: $2 a month, plus 0.25% + 25¢ per payout.

**What Stripe means for you, outside the app:**
1. Form the LLC through Atlas. This includes a US bank account.
2. Every year, file Form 5472 (the form a foreign-owned US company must send). Use an accountant, because the penalty for missing it is large.
3. Turn on Connect and Stripe Tax. Stripe reviews the live site first.
4. Get tax advice. You become the seller, not a middleman. For example, EU VAT applies from the first euro you sell.
5. Paying coaches **outside the US, UK, EU, Canada and Switzerland** needs Stripe "Global Payouts". It is aimed at bigger businesses, and it isn't confirmed that yours would be approved. Ask Stripe's sales team before promising coaches worldwide payouts.

**Coach tax forms:** Stripe can prepare and send the US 1099 forms (for US coaches paid $2,000 or more a year). Coaches outside the US fill in a W-8BEN form. With PayPal there are no US forms, but your own tax in Oman is your responsibility.

**What happens to the Paddle code:** `lib/billing.js` is rewritten for the chosen provider, keeping the same functions the rest of the app calls. The webhook keeps receiving the untouched raw message, as today. The `PADDLE_*` settings become the new provider's settings. The `paddle_customer_id` column gets a neutral name in a new column; nothing is dropped. The Refunds and Terms pages stop naming Paddle as the seller.

**Timing catch:** Step 5 is tested in the provider's test mode. Stripe's test mode needs the Stripe account, so it needs the LLC first (Atlas usually takes days to a couple of weeks). PayPal's test mode works today. Steps 2 to 4 don't depend on this at all.

## 2. Prices (proposals; you set every price)

| Price | Suggested | Why |
|---|---|---|
| Student monthly | **$99 default; each coach picks $49–$299** | Online coaching usually costs $100–300 a month. Future charges $149. |
| Coach startup fee | **$49 once** | Keeps out casual sign-ups. Coach apps charge $9–26 a month for entry plans. |
| Commission | **15% per student; 10% once a coach has 20+ students** | About $15 per $99 student, which covers card fees and support. Above 20% coaches drift to Trainerize. |
| Solo AI plan | **$12.99 a month or $89.99 a year** | Just under Fitbod ($15.99 or $95.99). The weekly re-adjust justifies being close to it. |

**Growth-first alternative:** no startup fee, 20% commission for the first year then 12%, $79 student default, and $9.99 a month or $69.99 a year for the AI plan.

Checked on the companies' own pricing pages: [Trainerize](https://www.trainerize.com/pricing/), [TrueCoach](https://truecoach.co/pricing/), [Everfit](https://everfit.io/pricing/). Future and Fitbod came from reviews and Fitbod's help centre, because their own pages didn't load.

## 3. Photo storage and email

- **Photos: suggested default is a Railway Storage Bucket**, a private storage space inside your Railway account.
  - About $0.23 a month for 15 GB. A disk attached to the server would be about $2–3, and needs the Pro plan above 5 GB.
  - Photos only ever go through the app's signed-in route.
  - Moving to Cloudflare R2 or Amazon S3 later is just a settings change.
  - Two things are still unchecked: Railway's bucket page didn't load, so its prices came from search results, and bucket backups aren't confirmed.
  - The plan's original default is a disk attached to the server (`UPLOAD_DIR`). It is simpler, but allows only one copy of the app and has a brief outage on each deploy.
- **Email: suggested default is Resend.**
  - Free up to 3,000 emails a month.
  - Stays asleep until `RESEND_API_KEY` and `EMAIL_FROM` are set.
  - You need your own web address (domain) and must add its DNS records.
  - No sender confirmed that someone in Oman can sign up, so try the signup first.

## 4. Small questions from the specs (my suggested default in brackets)

1. **"Calories burned" stays or goes?** The `calories` column in the daily log is calories **burned**, typed in or brought from Apple Health. It is not food. Food lives only in the two nutrition tables. The plan listed it for removal and for Step 8's deletion. [**Keep it.** It is exercise data, and removing it also removes it from Apple Health sync.]
2. **Coach specialty "Nutrition":** hide it from the picker, and existing profiles keep working. [Yes, hide it.]
3. **People already on a 4-week plan:** should they get their full matched plan? [Yes. Everyone gets the full plan, as the build plan says.]
4. **If the AI fails at the weekly moment:** try again the next time the plan is opened. [Yes, at most once a day.]
5. **Can coaches edit their check-in questions?** [Yes, up to 8, starting from 4 ready-made ones.]
6. **Can a linked coach see measurements without a switch?** [Yes, like weight and waist today. Only photos need the share switch.]
7. **Measurement limits, in cm:** [chest 30–250, arms 10–100, hips 30–250, thighs 20–150, neck 15–80.]

## 5. Specs to approve (for Steps 2, 3 and 4)

- `~/claude/Agents/docs/specs/cut/remove-food-tracking.md`
- `~/claude/Agents/docs/specs/cut/solo-ai-plan.md`
- `~/claude/Agents/docs/specs/cut/coach-tools.md`

## 6. Second provider search (30 Sep 2026): Whop found

**Better than PayPal: Whop, using its "Whop for Platforms" feature.**
- An individual in Oman can sign up. Fitness coaching is allowed (Whop bans therapy and supplements, not coaching).
- Each coach gets their own Whop account and passes Whop's identity check. Whop pays coaches in 200+ countries.
- Each coach can have their own monthly price.
- Fees: 2.7% + 30¢ per card payment, plus 1.5% for foreign cards. Whop can also collect and pay US, EU and UK sales tax for 2% extra.
- Free test mode today at sandbox.whop.com.
- Sources: [banned countries](https://docs.whop.com/trust-and-safety/trust-safety-overview/sanctioned-countries), [banned businesses](https://docs.whop.com/trust-and-safety/trust-safety-overview/what-is-not-allowed-on-whop), [collecting for coaches](https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts), [fees](https://docs.whop.com/fees), [sandbox](https://docs.whop.com/developer/guides/sandbox).

**Still to confirm:**
- Is Cut's cut taken automatically on every monthly renewal? Test this in the sandbox. If not, Cut collects the payment and sends each coach their share.
- Do payouts reach Omani banks?

**Checked and ruled out:**
- Tap: needs an Omani company, and paying coaches worldwide is unconfirmed.
- Stripe through a UAE company: cannot pay coaches worldwide.
- Dodo Payments: bans coaching.
- Several others could only be checked lightly, because the web tools hit their limit.

**Owner to-dos if Whop is chosen:**
1. Create a sandbox.whop.com account and share its test keys.
2. Create the real account and add an Omani bank account.
3. Ask Whop support two things: is "Whop for Platforms" switched on for your account, and is Cut's cut taken again on every renewal?
4. Choose the sales-tax option.

The provider becomes final at the Step 5 gate.
