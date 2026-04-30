# Distribution Playbook — First 1,000 Users
**Owner:** founder@cwleaders.com
**Time horizon:** Day 0 → Day 90
**Budget:** $0 paid · 100% organic · 100% founder-led

---

## STRATEGIC POSITION

We have one structural advantage: **the file-share viral loop**. Every time a free user uploads a file via `upload.cwleaders.com`, the recipient lands on `download.cwleaders.com` and sees a clean Receipt + a "Send one back →" CTA. That single mechanic is the fastest channel to compounding growth — every paid user buys ~3-5 free recipients per month.

Everything else is wedge-dependent: pick one beachhead, dominate it, then expand.

## CHOSEN WEDGE — "Fastest screen recorder for visual thinkers who hate Loom"

**Why this wedge wins:**
- Loom Pro starts at $15/mo for 25 videos; we ship $4.99/mo unlimited + Mind-Free canvas.
- "Visual thinkers" is a self-identifying audience: indie hackers, designers, technical PMs, dev-rel people — all hyperactive on the channels we already inhabit.
- Mind-Free dark theme + 1-click recording demo screenshots well on Twitter/X.

**Disqualified wedges (deferred):**
- Hiring (myhire) — long sales cycle; $100+ CAC; revisit at month 6.
- Workforce monitoring (Command) — enterprise sale; needs SOC2 + reference customers.
- File send (upload) — commoditized; only useful as a viral hook for Studio/Record.

---

## CHANNEL PLAN

### Channel 1 — ProductHunt launch *(highest leverage, one-shot)*
**Target launch date:** within 14 days of v0.1.1 desktop binary going live.
**Asset kit needed:**
- 8-image gallery showcasing Mind-Free canvas, recording flow, AI debrief, and the "4 tools, 1 download" headline.
- 60-second demo GIF: drag-drop install → record → share → recipient downloads.
- "First 100 hunters get free Powerhouse for 1 year" coupon (Stripe coupon code `PH100`).
- Maker comments: 3 founder-written explainers ready to drop in first hour.

**Goal:** Top 5 of the day. Realistic conversion: 800–2k visits, 200–500 free signups, 20–50 paid.

### Channel 2 — Twitter/X build-in-public
**Cadence:** 5 posts/week minimum.
**Mix:**
- 40% live-build screenshots ("today I shipped X")
- 25% provocative takes on incumbents ("Why I rebuilt Loom in a week")
- 25% reposts of users sharing recordings made in Studio
- 10% replies in dev-tool community threads

**Multipliers:** Tag `@levelsio`, `@dvassallo`, `@thatroblennon` when relevant — they reply to good builders.

### Channel 3 — Hacker News *(2-shot strategy)*
**Show HN #1:** Day 0 — "Show HN: I built a Loom alternative for visual thinkers, $4.99/mo unlimited."
**Show HN #2:** Day 60 — A *technical* post: "How we ship a 3.4MB cross-platform desktop app with 27KB SPA bundles." Different angle, different audience.

**Don't make these mistakes:**
- Don't post during US AM hours UTC unless ready to camp the comments for 8h.
- Don't shadow-game the rankings.

### Channel 4 — IndieHackers + r/SideProject + r/webdev
**Once-per-channel** post cadence; each fits a different angle.
- IndieHackers: "$0 to $10k MRR open log" — full transparency hooks growth.
- r/SideProject: visual screenshots, "rate my landing page" honesty.
- r/webdev: technical post about Tauri + serverless cost engineering.

### Channel 5 — Built-in viral loop
**Cost:** zero engineering — already shipped.
**Mechanic:** Free uploaders generate share links → recipients hit `download.cwleaders.com/<token>` → see "Send one back →" CTA pointing to `upload.cwleaders.com/?from=dl:<token>` → that page tracks attribution.
**Optimization plan:**
- A/B the receive-page CTA after Day 30 (manual cohort split via persona).
- Add upgrade nudge on receive page: "Sender used Studio Pro — try it free."

### Channel 6 — Dev-rel / Newsletter syndication *(month 2+)*
- TLDR newsletter (gets ~1M devs)
- Console (Hacker News-y newsletter)
- Pioneer's launches

### Channel 7 — Content moat *(month 3+)*
- Blog at `lead.cwleaders.com/blog` (NOT yet built — defer until first 100 paid).
- 3 cornerstone posts that rank for "loom alternative", "mind map screen recorder", "free file send link".

---

## METRICS DASHBOARD (track daily)

| Metric | Day 7 target | Day 30 target | Day 90 target |
|---|---|---|---|
| Total signups | 50 | 500 | 3,000 |
| Paid conversions | 5 | 50 | 200 |
| File-share viral coefficient | n/a (need data) | 0.3 | 0.6 |
| Day-7 retention | 30% | 35% | 40% |
| Twitter followers | 100 | 500 | 2,500 |

If any 30-day metric is <50% of target → revisit Risk R1 in `RISK-AND-KILL-CRITERIA.md`.

---

## CHANNEL PARTNERSHIP SHORTLIST (Point #73)

Partners to approach by month 3 once core product proves out:

| Partner | Model | Effort | Expected lift |
|---|---|---|---|
| **Apple App Store / Mac App Store** | Distribution | 4 weeks notarization + sandboxing rework | High — long-term discovery |
| **Setapp** ($9.99/mo all-you-can-eat Mac apps) | Bundle revenue share | 2 weeks integration | Medium — recurring discovery, low CAC |
| **Tauri community showcase** | Cross-promotion | 1 day (a great write-up) | Medium — dev-rel reach |
| **Indie Hackers Stack** | Listing + reviews | 1 day | Medium |
| **GitHub Student Pack** | Free year for students | 2 weeks legal + ops | Low-Med — long-tail brand |
| **YC's Tools list** | Listing (founder-friendly community) | 1 day if alum-connected | High signal-to-noise |
| **Notion Marketplace / Templates** | "Visual thinker template" pack with embedded Studio links | 1 week | Medium — lateral cross-sell |

**No partner conversations until Day 60.** The product needs traction before partners engage seriously.

---

## SOMETHING WE EXPLICITLY WON'T DO

- ❌ Paid ads (Google, Meta) — burn rate without distribution-economics validation.
- ❌ Cold outreach to enterprises — wrong wedge until SOC2.
- ❌ Influencer marketing — out of budget; brand isn't strong enough yet.
- ❌ Affiliate program — too early; needs LTV data first.

If a channel is missing here, it's not in the plan. Discipline is the moat.
