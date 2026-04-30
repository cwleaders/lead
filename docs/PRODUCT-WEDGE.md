# Product Wedge — The One Thing We Win
**Decision-maker:** founder
**Reviewed:** monthly until product-market fit signal stable

---

## THE PROBLEM (#37)

> "I record a 5-minute Loom. The recipient watches 30 seconds, replies 'TLDR?'. I rewrite the whole thing as a wall of text. The video was a waste."

**Pain (validated by founder's 6-year operating history; to be re-validated via 5 user interviews in week 1 of launch):**
- Existing screen recorders (Loom, Screencastify, Vidyard) optimize for *capture*, not for *re-watch*.
- People skim, scrub, and time-quote. No tool surfaces the structure of a recording — just a linear timeline.
- The result: video tools get used as one-shots, then abandoned. Knowledge dies in MP4s nobody opens.

**Evidence:** Loom's own data (2024 transparency report): median view-completion 38%. Most recordings are watched <60% by their intended audience.

**The thesis:** A screen recorder that becomes *more useful over time* — a Mind-Free canvas of every clip, transcribed, navigable, share-link-per-moment — wins where Loom plateaus.

## TARGET USER — wedge persona (#38)

**Wedge:** Indie hackers + technical PMs who already use Loom and complain about it on Twitter.

**Why this persona:**
1. They self-identify (Twitter bio "building", "indie", "PM @ ...").
2. They share workflow opinions publicly (free distribution).
3. They convert at 7-12% from cold landing-page (industry benchmark for dev tools).
4. They tolerate v0.x rough edges if the wedge is sharp.
5. Their LTV is $50-150 (Powerhouse → Agentic upgrade path).

**Disqualified personas (deferred until wedge proves out):**
- Enterprise IT buyers: 9-month sales cycle. Revisit Q2.
- Educators: low LTV, high support cost. Revisit at 5k MAU.
- Customer support teams: ticket-driven, won't pay individually. Revisit when team-tier is built.
- Recruiters (myhire): different product motion. Defer to month 6.

**Persona profile:**
| Attribute | Description |
|---|---|
| Job titles | Indie hacker, technical PM, dev-rel, founder, staff engineer |
| Tools they use | Loom, Notion, Linear, Slack, Twitter/X, GitHub |
| Where they live online | Twitter/X, IndieHackers, HN, r/SideProject, sub-stacks |
| Buying authority | Self-purchase (no procurement) |
| Price sensitivity | $5-15/mo paid personally; >$30 needs justification |
| What they don't like | Long onboarding, unclear pricing, "team plans starting at $50/seat" |

## COMPETITIVE LANDSCAPE (#39)

**2×2 Map:** *Capture sophistication* (x-axis) × *Post-recording structure* (y-axis)

```
              HIGH structure
                   ▲
        Notion AI  │   ★ CW LEADERS
        (text-     │     (canvas of
         centric)  │      clips)
                   │
─────────────────────────────────────────▶ HIGH capture
        Voice      │
        memo apps  │   Loom, Vidyard,
        (lo-fi)    │   Screencastify
                   │
                   ▼
              LOW structure
```

**Direct competitors:**
| Competitor | Strength | Weakness | Our angle |
|---|---|---|---|
| **Loom** | Brand, ubiquity, $400M ARR | Linear timeline, $15+/mo | Mind-Free canvas + $4.99 |
| **Vidyard** | Sales-team focus | Heavy, slow, enterprise-priced | Bootstrap-priced + faster |
| **Tella** | Beautiful UX | Limited free tier | Open-source spirit + cheaper |
| **Scribe** | Auto-documentation | Step-by-step only, no video | Same workflow, with video |
| **Notion AI** | Distribution | No native screen recording | Recording is our unique input |

**Indirect competitors:** screenshots + Slack threads (the *real* competition for most workflows).

**Differentiation:**
- Mind-Free canvas (no folders, infinite-zoom organization)
- Local-first by default (privacy, speed)
- 4 tools bundled: recorder + send + hire + manage — competitor coverage requires 4 separate subscriptions
- AI-overlaid (Whisper local, Gemini cloud) — captures and *structures* simultaneously

## UVP — the one sentence (#40)

> **"The screen recorder that organizes your work *the way you actually think*. One free download, four tools, no Loom-tax."**

**Demo plan to deliver this UVP on the landing page:**
- 12-second autoplay video on `lead.cwleaders.com` showing: drag-drop install → record desktop → drop the clip into Mind-Free canvas → AI-generated summary appears next to it → share link copied. Total time on screen: 12 seconds. *That* is the aha moment.
- Build in week 1 of public launch. Currently: static screenshot.

## FEATURE WEDGE (#41) — what ships in v1, what waits

**MUST-HAVE (week 0):**
1. Magic-link signup / Google sign-in
2. Desktop record + share link generation
3. Mind-Free canvas with at minimum 5 clips visible
4. Free → Powerhouse upgrade flow
5. Recipient receive page with "Send one back" CTA

**SHOULD-HAVE (week 4):**
6. Whisper transcription overlay
7. AI debrief (Gemini summary)
8. Browser extension for one-click capture *(deferred — extension cost is high)*

**WON'T-HAVE in v1:**
- Workforce monitoring (Command tier) — gated to "request early access"
- Hiring (myhire) — gated to "request early access"
- Team plans — single-seat only, until 100 paid singles
- Custom branding / white-label
- Native mobile apps (Tauri mobile is alpha)

**Brutal cut criterion:** if a feature isn't demonstrated in the 12-second landing demo, it's not in v1.

## RETENTION & ENGAGEMENT LOOPS (#46)

```
        ┌───────────────────────────────────┐
        │                                   │
        ▼                                   │
   USER RECORDS                       Recipient
        │                              opens link
        ▼                                   │
   SHARE LINK                               ▼
   CREATED ───→ Recipient gets link ──→ Sees "Send one back"
        │                                   │
        ▼                                   ▼
   AI generates                       Recipient signs up
   debrief                                  │
        │                                   ▼
        ▼                            Becomes new sender
   USER opens                               │
   their canvas                             ▼
        │                            (loop closes — viral
        ▼                             coefficient k goes here)
   SEES PAST CLIPS,
   RE-USES THEM
        │
        ▼
   COMES BACK NEXT WEEK
```

**Three feedback loops measured:**
1. **Inner loop (daily/weekly):** record → reuse → record again. Measured by `studio.record_complete` event count per user per week.
2. **Outer loop (viral, monthly):** sender → recipient → new sender. Measured by viral coefficient k (#46).
3. **Compounding loop (canvas value):** more clips on canvas → more value to revisit. Measured by D28 retention (KPI #3).

If inner loop weakens, polish recording UX. If outer loop weakens, optimize receive-page CTAs. If compounding loop weakens, the canvas isn't valuable enough — that's product-redesign signal.

---

## VALIDATION PLAN — week 1 post-launch

**5 user interviews** (45 min each, $50 Stripe credit thank-you):
1. "Walk me through the last screen recording you sent."
2. "What did you wish you could do with it after?"
3. "Show me the tool you used. What do you hate about it?"
4. (Show our prototype) "What's confusing? What's surprising?"
5. "If you signed up, what would make you cancel?"

**Recruit:** Twitter DMs to people who tweeted "Loom" or "screen recorder" in the last 7 days. Aim 50 DMs to land 5 interviews.

**Output:** A second version of this doc with quotes, behavioral patterns, and feature kills. By week 4.
