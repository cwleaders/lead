# Team & Operations Plan
**Owner:** founder
**Reviewed:** monthly until first hire; quarterly thereafter

---

## CURRENT STATE

| Function | Owner | Coverage |
|---|---|---|
| Engineering (full-stack) | founder + Claude (AI pair) | ✅ |
| Product strategy | founder | ✅ |
| Design (visual) | founder + tokens.css system | ⚠️ — no dedicated designer |
| Operations (deploy, on-call) | founder | ⚠️ — SPOF |
| Customer support | founder via hello@cwleaders.com | ⚠️ — manual |
| Marketing / growth | founder | ❌ — no execution capacity |
| Legal | founder + DPA template | ⚠️ — non-attorney drafted |
| Finance / accounting | founder + Stripe dashboard | ⚠️ — no bookkeeper |

**Brutal read:** founder is 1× of needed capacity. The platform out-paces the operator.

---

## SKILL COVERAGE GAPS (#29)

| Gap | Severity | Mitigation |
|---|---|---|
| Distribution / growth marketing | HIGH | Hire fractional growth marketer at month 3 ($2-4k/mo) |
| Visual design polish | MED | Outsource per-feature to dribbble freelancers ($500-1500/each) |
| Customer support volume | HIGH at >500 users | Route via Help Scout free tier; founder triages until first hire |
| Bookkeeping / tax | MED | Bench.co or similar at $200/mo from month 6 |
| Legal review | LOW for now | Consult Cooley free-startup tier when first contract dispute arises |

## HIRING PLAN (#31)

**Trigger to hire #1:** $5k MRR (≈350 paying customers). At that scale, support load + marketing throughput exceed founder capacity.

| Order | Role | Type | Rate | Trigger | Why this role first |
|---|---|---|---|---|---|
| 1 | Growth marketer | Fractional 20h/wk | $3,500/mo | $5k MRR | Distribution is the existential gap |
| 2 | Senior engineer | Full-time | $8-12k/mo (or eq.) | $20k MRR | Frees founder for product + sales |
| 3 | Designer | Contract per project | $1k/wk | $30k MRR | Polish moves conversion 20-30% |
| 4 | Customer success | Full-time | $4-6k/mo | 1k paying users | Support → retention engine |

**Total annualized cost (all 4 roles): ~$200k/year** — covered at ~$25k MRR run-rate. We don't hire until revenue justifies it.

**Hiring channels:**
- Engineer: ex-Loom/Notion/Linear ICs via Twitter; equity-friendly indies who want a real product
- Marketer: indie-friendly fractional networks (e.g., MarketerHire, growthmentor)
- Designer: dribbble + ad-hoc freelance, then convert to contract
- CS: from existing user base ("who's already a power user?")

## DECISION-MAKING FRAMEWORK (#33)

While team = 1, founder is unilateral. **Once team ≥ 2**, adopt this:

### RACI matrix

| Decision class | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Pricing changes | Founder | Founder | Marketer | Engineer, CS |
| Feature shipping | Engineer | Founder | Marketer, Designer | CS |
| Brand / marketing | Marketer | Founder | Designer | Engineer, CS |
| On-call rotation | Engineer | Founder | — | All |
| Hiring | Founder | Founder | Existing team | All |
| Refunds (>$100) | CS | Founder | — | Founder daily digest |
| Vendor selection | Engineer | Founder | — | All |

**Tie-breaker:** founder. Until founder hands accountability to a Head of <function>.

### Conflict resolution

1. State the disagreement in writing (1-paragraph max each).
2. Propose three options.
3. Founder picks one or asks for time-boxed spike (2-day max).
4. Document outcome in `decisions.log` for institutional memory.

## COMMUNICATION & COLLABORATION TOOLS (#34)

**Decided pre-hire so first hire onboards into a system, not a vacuum:**

| Function | Tool | Cost | Why |
|---|---|---|---|
| Async chat | Discord (private server) | Free | Lower-pressure than Slack; better for indie team feel |
| Standups | Async daily in #daily-standup channel | Free | No-meeting culture |
| Tasks | Linear (free tier) | Free up to 250 issues | Designed for software teams; cheap to scale |
| Docs | This `/docs/` folder + GitHub | Free | Single source of truth, version-controlled |
| Calls | Tella + Studio (dogfood!) + Google Meet | Free | Use our own product |
| Code review | GitHub PRs | Free | Standard |
| Customer support | Help Scout free tier (100 contacts/mo) | Free → $20/mo | Email-first matches user expectation |
| Calendars | Cal.com (self-hosted optional) | Free | Privacy-aligned |
| Password manager | 1Password Teams | $4/seat/mo | Required; non-negotiable for prod creds |

**Total tool stack cost at team=4: ~$80/mo.** Acceptable.

**No-meeting policy:**
- Tuesday + Thursday are no-meeting days
- Meetings require: agenda in advance, written outcome after, max 25 min unless flagged
- All decisions back to writing in this doc structure

## ONBOARDING PLAYBOOK (drafts, applied to first hire)

Day 1: Read `LAUNCH-STATE.md`, `RUNBOOK.md`, `RISK-AND-KILL-CRITERIA.md`, `PRODUCT-WEDGE.md`.
Day 2-3: Shadow founder on a deploy + an incident retrospective (even fabricated).
Week 1: Ship one trivial PR — process is the lesson.
Week 2: Own one CloudWatch alarm; be primary responder for it.
Week 4: Lead one decision end-to-end.
Day 90: First retro on the relationship — keep going / change something / part ways.

---

## OUTSOURCING STRATEGY (#35)

Already documented as ✅ in original assessment. Summary:
- AWS managed services do the operational heavy lifting (no DevOps hire needed pre-team)
- Tauri community absorbs cross-platform desktop maintenance
- No mission-critical outsourced work; if it broke we couldn't ship

If outsourcing increases (e.g., agency for marketing assets), require:
- Statement of Work with measurable deliverables
- Time-boxed (max 6 weeks)
- Source files delivered, not just final assets
