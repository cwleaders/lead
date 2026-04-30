# CW Leaders Studio — Operations Runbook
**Owner:** founder@cwleaders.com (primary on-call)
**Backup:** TBD (first hire)
**Last revised:** 2026-04-30

> **Mandate:** This runbook makes the platform operable by anyone with read-only AWS access. If the founder is unreachable, every recovery action below is executable from a laptop with awscli configured.

---

## 1. ON-CALL & ESCALATION

| Tier | Responder | Channel | Response SLA |
|---|---|---|---|
| 0. Synthetic alarm | EventBridge → SNS `lead-alarms` | hello@cwleaders.com | best-effort |
| 1. P1 (revenue / data loss) | founder@cwleaders.com | SMS + email | 30 min |
| 2. P2 (degraded) | founder@cwleaders.com | email | 4 h |
| 3. P3 (cosmetic) | github issue | async | next sprint |

Until first hire, founder is sole on-call. **Acceptable risk window: 8 hours of unconsciousness/travel without coverage.** Anything longer requires backup activation.

---

## 2. SINGLE POINT OF FAILURE — MITIGATION

**Risk:** All institutional knowledge lives in founder's head and `~/.aws` profile.

**Mitigations:**
1. This runbook (you're reading it).
2. `LAUNCH-STATE.md` documents resource IDs (API ID, distribution IDs, table name).
3. AWS root account credentials sealed in 1Password vault `cwl-prod-emergency` (combo shared with one trusted person).
4. Stripe + Firebase root creds same vault.
5. JWT_SECRET, STRIPE_WEBHOOK_SECRET, AI keys: Lambda env (recoverable from any function-config call by anyone with IAM).

**Time-to-recover-without-founder: ~4 hours** (vault access + AWS console + this runbook).

---

## 3. INCIDENT RESPONSE

### 3.1 Detection
- CloudWatch alarms publish to SNS `arn:aws:sns:us-east-1:069422358723:lead-alarms`
- 5 active alarms: `lead-api-5xx-spike`, `lead-api-latency-high`, `lead-lambda-errors`, `lead-ddb-user-errors`, `lead-health-down`
- /health probe every 5 min via EventBridge `lead-health-keepwarm`

### 3.2 Triage flowchart
```
Alarm fired
    │
    ▼
Is /health 200?  ───── No ─→ Check CloudWatch logs for failing function
    │ Yes                     If recent deploy: ROLL BACK (§3.4)
    ▼                         If DDB throttled: scale-test now
Is api.cwleaders.com up?      Else: open Stripe/Firebase/Gemini status pages
    │ Yes                          
    ▼
Is it a single function?
    │
    ▼
Yes → check that function's logs, last deploy
No → check WAF, Route53, CloudFront
```

### 3.3 Containment commands

**Disable a misbehaving Lambda** (refuses traffic, returns 500):
```bash
aws lambda put-function-concurrency --function-name lead-<fn> --reserved-concurrent-executions 0
```

**Block a hostile IP** (add to existing WAF ACL):
```bash
aws wafv2 update-web-acl --scope REGIONAL --id 88dc3c74-6055-41c1-804e-12300d0f1ff0 \
  --name cwleaders-api-waf --lock-token <token> \
  --rules file://waf-rules-with-blocked-ip.json
```

**Take an SPA offline** (CloudFront → maintenance page):
```bash
aws s3 cp ./maintenance.html s3://lead-portal-069422358723/index.html \
  --cache-control "public,max-age=10"
aws cloudfront create-invalidation --distribution-id E3O1NGCZB44SYA --paths "/index.html" "/"
```

### 3.4 Rollback (Lambda)
Every Lambda update publishes a new version. Roll back by repointing the alias or republishing prior version's code:
```bash
# Find prior version
aws lambda list-versions-by-function --function-name lead-<fn> --query 'Versions[-2].Version' --output text
# Get its code zip
aws lambda get-function --function-name lead-<fn>:<prev-version> --query 'Code.Location' --output text
# Re-deploy that zip as $LATEST  (or shift alias if using aliases)
curl -o /tmp/rollback.zip "<url-from-above>"
aws lambda update-function-code --function-name lead-<fn> --zip-file fileb:///tmp/rollback.zip --publish
```
**Target rollback time: < 5 minutes per function.**

### 3.5 Communication template
On a P1 in progress:
1. Tweet from @cwleaders: "We're investigating elevated error rates on Studio. Updates here."
2. Banner injected into all 5 SPAs via `body.maintenance` class (preset CSS in `eq.css`).
3. Status email to all paying customers from `hello@cwleaders.com`.

---

## 4. DISASTER RECOVERY

| Tier | Loss scenario | RPO | RTO | Mechanism |
|---|---|---|---|---|
| 1 | Single Lambda corruption | 0 | 5 min | Re-deploy from git or roll back version |
| 2 | DynamoDB region outage | 5 min | 1 h | DDB PITR restore (point-in-time, last 35 d) |
| 3 | Account-wide AWS compromise | 24 h | 4 h | Cross-account DDB export (cron daily, S3 versioning) ‹PENDING› |
| 4 | Stripe account suspension | 0 | 24 h | Manual customer migration to backup PSP ‹PENDING› |
| 5 | Founder incapacitated | n/a | 4 h | Vault `cwl-prod-emergency` + this runbook |

### Tested operations
- ✅ Lambda rollback: tested mentally only, action proven via session-history
- ✅ DDB PITR: enabled, **NOT YET TESTED**. Action: trigger a sample restore by 2026-05-15.
- ❌ Cross-region DDB backup: not yet built (pre-launch acceptable; required by 5k MAU).
- ❌ Stripe account-loss playbook: not yet written.

---

## 5. ROUTINE OPERATIONS

### 5.1 Deploy code change
```bash
cd backend/infra && ./deploy.sh frontend     # SPA assets + CDN invalidation
cd backend/infra && ./deploy.sh lambdas      # Lambda zips
```

### 5.2 Read API logs (last 5 min)
```bash
aws logs tail /aws/lambda/lead-<fn> --since 5m
```

### 5.3 Tail the alarm topic
```bash
aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:069422358723:lead-alarms
```

### 5.4 Confirm hosted zones / cert renewals
ACM auto-renews. Check expiry of `*.cwleaders.com` certs once per quarter:
```bash
aws acm describe-certificate --certificate-arn <arn> --query 'Certificate.NotAfter'
```

### 5.5 Rotate JWT_SECRET (every 90 days)
```bash
NEW=$(openssl rand -hex 48)
for fn in $(aws lambda list-functions --query 'Functions[?starts_with(FunctionName,`lead-`)].FunctionName' --output text); do
  cur=$(aws lambda get-function-configuration --function-name $fn --query Environment.Variables --output json)
  patched=$(echo $cur | jq ". + {JWT_SECRET: \"$NEW\"}")
  aws lambda update-function-configuration --function-name $fn --environment "{\"Variables\":$patched}"
done
```
**All existing JWTs become invalid; users must sign in again.** Communicate ahead.

---

## 6. KNOWLEDGE INDEX

| Document | Purpose |
|---|---|
| `LAUNCH-STATE.md` | Resource IDs, configured state, post-mastering snapshot |
| `RUNBOOK.md` (this) | Day-2 operations, IR, DR, SPOF |
| `docs/RISK-AND-KILL-CRITERIA.md` | Top 5 risks; trip-wires for "stop" decision |
| `docs/STRIDE-THREAT-MODEL.md` | Attack surface map + top vectors + mitigations |
| `docs/DEFERRED-DECISIONS.md` | i18n / A/B / ETL / ML — explicit "not yet, here's when" |
| `docs/DISTRIBUTION-PLAYBOOK.md` | First-1k-users plan, channel strategy |
| `docs/MIGRATION-ROADMAP.md` | CDK + TypeScript + Secrets Manager future moves |
| `lead-desktop/CHANGELOG.md` | Desktop release notes |
| `lead-desktop/RELEASE-v0.1.1.md` | Build/publish runbook for desktop |
| `backend/infra/deploy.sh` | Idempotent infra+lambda deploy script |
| `tests/load/k6-smoke.js` | Load test scenario; run before every minor release |

When the team grows: copy this runbook into the company wiki; do not let knowledge drift back into individuals.

---

## 7. ESCALATION OF AUTHORITY

If founder is unreachable for >24h, the holder of the `cwl-prod-emergency` vault is authorized to:
1. Pause all Stripe charges (`stripe.com/dashboard/settings/account` → freeze).
2. Publish a maintenance banner.
3. Roll back the most recent deploy.
4. **NOT** authorized to: modify pricing, rotate JWT_SECRET, modify legal docs, communicate to press.
