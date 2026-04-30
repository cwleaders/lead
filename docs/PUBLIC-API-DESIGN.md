# Public API & SDK — Forward Design (NOT YET BUILT)
**Status:** Specification only — implementation deferred per `DEFERRED-DECISIONS.md` until 5 explicit integration requests.
**Last revised:** 2026-04-30

This document is a *contract before commitment*. When we do build it, this is the shape.

---

## DESIGN PRINCIPLES

1. **REST + JSON, not GraphQL.** Predictable for partners, cacheable, no schema-coupling.
2. **OAuth 2.0 + scopes.** No long-lived API keys for end users.
3. **Versioned at the URL.** `/v1/` then `/v2/`, with one-year overlap.
4. **Idempotency keys** on every POST. Retries are safe.
5. **Pagination via cursors.** Never offset-based at scale.
6. **Webhooks signed with HMAC-SHA256.** Identical to our Stripe model.

## SURFACE

```
GET    /v1/me                       — current user
GET    /v1/recordings               — list user's recordings (cursor-paged)
GET    /v1/recordings/{id}          — single recording (incl. transcript, share URL)
POST   /v1/recordings               — create recording (uploaded via presigned URL)
DELETE /v1/recordings/{id}          — delete

GET    /v1/files                    — list shared files
POST   /v1/files                    — upload entry (returns presign)
DELETE /v1/files/{id}

POST   /v1/agents/{agentId}/run     — invoke an AI agent on a prompt
GET    /v1/agents                   — list available agents

GET    /v1/usage                    — credit balance, monthly recap

POST   /v1/webhooks                 — register a webhook URL
DELETE /v1/webhooks/{id}            — unregister
```

## OAUTH SCOPES

| Scope | Allows |
|---|---|
| `read:account` | GET /v1/me, /v1/usage |
| `read:recordings` | List + read recordings + transcripts |
| `write:recordings` | Create + delete |
| `read:files` | List + read files |
| `write:files` | Upload + delete |
| `agents:run` | Invoke AI agents (consumes credits) |
| `webhooks:manage` | Register/manage webhooks |

Default consent screen requests narrowest possible scopes. Granular per-action consent.

## RATE LIMITS (per token)

| Endpoint family | Limit |
|---|---|
| Read endpoints | 600 / hour |
| Write endpoints | 60 / hour |
| `agents:run` | 10 / hour for free tier; tier-based for paid |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## WEBHOOK EVENTS (when we ship)

```
recording.created
recording.shared
recording.deleted
file.uploaded
file.downloaded
agent.run_completed
billing.subscription_changed
```

Signed payload:
```
X-CW-Signature: sha256=<hex>
X-CW-Timestamp: <unix>
```

Verification = `HMAC-SHA256(timestamp + "." + body, secret)`.

## SDK ROADMAP

When we ship public API:
1. **Node.js / TypeScript SDK** — `@cwleaders/sdk` — auto-generated from OpenAPI spec
2. **Python SDK** — second; data-science partners
3. **Go SDK** — third; infra partners

All generated from the same OpenAPI 3.1 spec (see `MIGRATION-ROADMAP.md`).

## EXTENSIBILITY MODEL

Beyond OAuth scopes, we offer two extensibility surfaces (designed-not-built):
- **Webhooks** for outbound events (above)
- **Custom Agent Definitions** — partners ship a `cwleaders-agent.json` defining a Studio-pluggable AI agent. Agents are sandboxed and scoped to a user's credits.

**No iframes, no postMessage, no UI extension API in v1.** Those create hard-to-deprecate contracts. Consider in v2 only.

## DEPRECATION POLICY

- 12-month minimum deprecation window for any breaking change
- Sunset notice in response headers (`Sunset: <date>`) per RFC 8594
- API changelog at `/v1/changelog` with RSS feed

---

## TRIGGER TO BUILD

Per `DEFERRED-DECISIONS.md`: 5 documented external integration requests OR a partnership deal demands it. **Estimated build effort:** 2 weeks for v1 surface + OAuth + 4 endpoints; 4 more weeks for SDK generation + docs site.
