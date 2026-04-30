# LEAD Roadmap — Bootstrap to Billion

Status as of session close. What ships now, what's next, what's deferred.

---

## ✅ SHIPPED (LIVE in production)

### Web Properties (3 SPAs on CloudFront + S3)
- **lead.cwleaders.com** — landing, pricing, sign-in modal, license redemption (`/unlock`), enterprise marketing (`/enterprise`), manager command center scaffold (`/command`), internal admin dashboard (`/admin`)
- **upload.cwleaders.com** — Mind-Free drop zone, multipart upload, JWT-aware tier limits, viral "Send file back" attribution
- **download.cwleaders.com** — Visual Receipt viewer, 302-redirect download, viral attribution chain

### Backend (14 Lambdas on API Gateway HTTP API)
- `presign-upload`, `complete-upload`, `get-file`, `visual-receipt`
- `auth-request`, `auth-verify`, `auth-me` (magic-link, HS256 JWT)
- `checkout-session`, `stripe-webhook` (license generation + SES delivery)
- `license-validate` (machine binding, JWT issuance)
- `waitlist`, `admin-snapshot`
- `enterprise-org` (org/team/consent/telemetry routing)
- `telemetry-ingest` (Tier 4 desktop agent endpoint)

### Data Layer
- Single-table DynamoDB with 2 GSIs and TTL on anonymous uploads
- 4 S3 buckets (3 SPA + 1 file storage) with OAC-locked CloudFront
- Cognito user pool reserved for future expansion
- Single IAM role with least-privilege scoped policy

### Infrastructure
- ACM SAN cert covering all 4 subdomains
- 3 CloudFront distributions (HTTP/2+3, IPv6, gzip, SPA fallback, clean-URL function)
- Route53 ALIAS records for lead/upload/download/api
- Idempotent `deploy.sh` with phase-targeted re-deploys (`frontend`, `lambdas`, `cf`, `cffn`, `perms`, `invalidate`, `status`)

---

## 🟡 PENDING SECRETS (5 minutes to revenue)

See [SECRETS.md](./SECRETS.md). Inject these and revenue activates:
1. `JWT_SECRET` — generate strong secret, inject to all Lambdas
2. `SES_FROM` — verify sender, enable production SES
3. `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` + `PRICE_MAP_JSON`
4. `ADMIN_EMAILS` — gate `/admin` dashboard

---

## 🔵 PHASE 3 — LEAD Desktop MVP (4-6 weeks)

The web ecosystem is the storefront and license/account layer. The desktop app is the product.

### Week 1-2: Tauri shell + native screen capture
- Tauri 2.x project under `lead-desktop/`
- Rust backend with native APIs:
  - **macOS:** `ScreenCaptureKit` via Swift bindings
  - **Windows:** `Desktop Duplication API` (DXGI)
  - **Linux:** `PipeWire` / Wayland
- FFmpeg pipe for local encoding to `.mp4`
- License key entry flow → `POST /license/validate` → cache JWT
- Auto-update via Tauri updater (signed binaries on S3)

### Week 3-4: Tier 2 features (Visual Powerhouse)
- ONNX runtime + quantized CLIP-ViT-B/32 for scene detection
- `.vmap` bundle format (zip of mp4 + JSON manifest + SVG storyboard)
- Spatial Focus spotlight overlay (transparent OS window)
- Kinetic keystroke ripples (global hook via `rdev` crate)
- Glassboard transparent draw window
- Mind-Free Infinite Canvas dashboard (web tech inside Tauri webview)

### Week 5-6: Tier 3 features (Agentic Cloud)
- DynamoDB sync of mind-map nodes/edges
- S3 sync of `.vmap` bundles
- Agentic router Lambda (Claude Sonnet 4.6 → Gemini 2.5 → local Llama fallback)
- Notion / Obsidian export integrations

### Deliverables
- Notarized `.dmg` (mac), signed `.msi` (win), `.AppImage` + `.deb` (linux)
- Auto-update channel
- Crash reporter with sanitized telemetry

---

## 🟣 PHASE 4 — Bossware (Tier 4 Enterprise) — 6-8 weeks

The web foundation is **already shipped** (org schema, consent API, telemetry ingest, manager dashboard scaffold, pricing page). The desktop telemetry agent is the heavy lift.

### Telemetry Agent (extends LEAD desktop)
- **Watchdog two-process architecture** — Process A and B mutually restart each other; no kill-switch
- **Edge AI vision model** — quantized LLaVA for state-change detection; only snapshot on meaningful events
- **Kinetic Timeline generator** — local Rust streams app-categorization vectors to Firestore
- **DuckDB embedded** — each employee machine becomes a localized SQL data lake
- **Black Box mode** — encrypted local buffering when offline; async data burst on reconnect
- **Atomic writes + sanitized crash telemetry**

### Manager Command Center (extends `/command`)
- WebRTC P2P live mirror via Google's free signaling
- Spatial chat bubbles synced through Firebase Realtime DB (free tier)
- Visual diff auto-resolve (local vision model registers state change → bubble dissolves)
- Red-node alert canvas with one-click 15-second clip review
- Bounding Overwatch live mirror activation

### Compliance Layer
- **Consent Handshake** — full-screen splash on agent first launch; cryptographic signature stored via `POST /enterprise/org/{id}/consent` ✅ already deployed
- **Hardware Audio Blackout** — Rust agent drops audio payload at capture layer
- **Geofenced Clock-Out** — recording pipeline blurs to black when shift ends
- **Wall Search audit freeze** — input lock until manager clearance

### Tactical Enforcement
- Digital Friction (5fps throttle on disallowed sites)
- Forceful clipboard clearing on sensitive data copy
- Skill-Check launch links via `lead://` URL handler
- Clean Room proctor mode (process tree scan)

### Mobile C2 Companion App
- Native iOS (Swift) + Android (Kotlin) — defer until desktop validates the model
- Push notifications for Flare alerts
- Swipeable storyboards

---

## 🟢 PHASE 5 — Scale economics (after first $50K MRR)

### Cost optimization
- **Cloudflare R2 migration** — drop S3 egress fees to $0. Files bucket only; metadata stays on DynamoDB. ~6 hours of migration.
- **CloudFront → Cloudflare CDN** — only if egress becomes meaningful
- **P2P binary updater** — distribute desktop installer updates across user base; eliminate update bandwidth

### Data hoarding payoff
- Athena queries over CloudFront access logs → cohort analytics
- ML pipeline on telemetry events → industry benchmarks (sellable as B2B data product)
- License-key behavioral patterns → upsell prediction model

### Viral acceleration
- Public profile pages (`download.cwleaders.com/u/<handle>`)
- Embeddable Visual Receipts for blog/Notion (`<iframe>` with our CDN)
- Affiliate program with split-token attribution

---

## 📊 Revenue model summary

| Tier | Price | Plan | Target |
|---|---|---|---|
| Free upload | $0 | Anon 100MB / Account 5GB | Lead capture |
| **Basic** | $4.99 | One-time | Hobbyist recorder users |
| **Powerhouse** | $19.99 | One-time | Educators, designers |
| **Agentic** | $29.99 + $4.99/mo | Subscription | Power users, teams |
| **Enterprise Org** | $99.99/yr | Per organization | Mid-market companies |
| **Enterprise Seat** | $19.99/mo/seat | Per employee | Same orgs scaled |

**Path to $1B valuation:**
1. **Year 1:** Tier 1-3 cash flow + email capture funnel = $500K ARR
2. **Year 2:** Enterprise Tier 4 ramp with 200 orgs × 15 seats avg = $7.2M ARR
3. **Year 3:** International + B2B data licensing = $30M ARR
4. **Year 4-5:** Acquirer / IPO at 30-50× ARR multiple

---

## 🛠 Operational notes

### Repo structure
```
leadsoftware/
├── lead-portal/          ← lead.cwleaders.com SPA (multi-page)
├── upload-app/           ← upload.cwleaders.com SPA
├── download-app/         ← download.cwleaders.com SPA
├── lead-desktop/         ← (future) Tauri app
├── shared/               ← design tokens, color system
├── backend/
│   ├── lambdas/          ← 14 production Lambdas
│   └── infra/            ← deploy.sh + state file
├── docs/
├── SECRETS.md            ← env var injection runbook
└── ROADMAP.md            ← this file
```

### Deploy commands
```bash
./backend/infra/deploy.sh all          # full re-deploy (idempotent)
./backend/infra/deploy.sh frontend     # only re-sync SPAs + invalidate CDN
./backend/infra/deploy.sh lambdas      # only repackage + redeploy Lambdas
./backend/infra/deploy.sh perms        # re-add API Gateway invoke perms
./backend/infra/deploy.sh status       # print all resource IDs
```

### Logs
```bash
aws logs tail /aws/lambda/lead-presign-upload --since 10m --format short
```

### Cost dashboard
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY --metrics UnblendedCost \
  --filter '{"Tags":{"Key":"Project","Values":["LEAD"]}}'
```
