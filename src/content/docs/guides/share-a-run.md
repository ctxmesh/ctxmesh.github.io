---
title: Share a run
description: "Mint a revocable, expiring link to one run — a redacted projection you preview and control — and revoke it any time."
---

**Goal:** turn a single run into a shareable link a logged-out teammate can open — a **redacted
projection** you preview before confirming, bounded by an expiry and killable at any time.

**Prerequisites:** a run you can access ([Observability & tracing](/guides/observability-and-tracing/)); the
run must be **durably stored** (a share into the hot in-memory store would die on restart, so it is
refused).

## What a shareable run link is

A shareable run link is a **single-run capability link**, not a CRD and not a tenant-wide read. The
reframing that makes an unauthenticated read safe:

- **Authorization is enforced at mint time** — you must have access to the run's agent to create a link.
- The token then grants **exactly one run's projection** — no list, no namespace traversal, no adjacent or
  lineage runs.
- It is **revocable and expiring** — the link is a control-plane record (the SHA-256 of the token is
  stored, never the token itself), so you can list live links and kill them.

The link is a **projection you control**, not the raw run: a `SharedRunView` built from an allowlist —
metadata + status + structure by default, and the transcript **only if you opt in** at mint. You
**preview the exact projection** before confirming, so nothing leaves that you did not see.

## 1. Open the run and share it

In the console, open the run and choose **Share**. The dialog previews the exact projection, offers an
**include transcript** toggle, and — on confirm — shows the link **once**.

Programmatically, mint against the run's own id (the mint is authorized by *your* access to the run's
agent):

```bash
# POST /api/runs/{id}/shares — body is optional; empty = metadata-only, default 7-day expiry.
curl -s -X POST https://<console-host>/api/runs/run-abc123/shares \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "includeContent": false, "ttlHours": 72 }'
```

The response returns the token **exactly once** (it is never retrievable again) plus a convenience URL and
the expiry:

```jsonc
{
  "id": "shr-…",
  "token": "…",                 // shown once — store it now
  "url": "/api/shared/runs/…",  // the public read path
  "expiresAt": "2026-09-02T12:00:00Z",
  "includeContent": false
}
```

## 2. Set scope and expiry

Two knobs at mint control the link:

- **`includeContent`** — `false` (default) shares metadata + status + structure (agent, status, timestamps,
  message count + roles, a coarse error category). `true` opts the projection into the run's **input +
  messages + full error** together. Since the projection is redaction-honest, preview it first.
- **`ttlHours`** — the link's lifetime. Defaults to **7 days** (168h); a value over the **90-day** (2160h)
  cap is clamped; `≤ 0` uses the default.

## 3. Open the link (unauthenticated)

The public read is the **one** unauthenticated route — a logged-out visitor opens
`GET /api/shared/runs/{token}` (the console renders it at a chrome-free `/shared/runs/:token` page). Missing,
bad, revoked, expired, or deleted-run tokens all return a **uniform 404** (no oracle); the page carries
`no-referrer` and `noindex`.

## 4. Manage and revoke

A public link without a kill switch is a different, worse feature — so list and revoke are first-class:

```bash
# List the links minted for one run (tokens are never returned).
curl -s https://<console-host>/api/runs/run-abc123/shares -H "Authorization: Bearer $TOKEN"

# Your active shares across ALL runs.
curl -s https://<console-host>/api/my/shares -H "Authorization: Bearer $TOKEN"

# Revoke one link — the public read then 404s immediately.
curl -s -X DELETE https://<console-host>/api/runs/run-abc123/shares/shr-… \
  -H "Authorization: Bearer $TOKEN"
```

Mint and revoke are audit-logged (never the token). The console exposes the same via a **manage shares**
list with a revoke action.

:::note
The public host / URL shape and the console routes above finalize toward GA; the load-bearing contract is:
mint at `POST /api/runs/{id}/shares` (caller-scoped), read once via the returned token on the single
unauthenticated route, and revoke by share id.
:::

## When to use / when not

- **Use** to hand a run to someone without a platform account — a bug repro, a demo, a stakeholder review —
  scoped to exactly that run and killable.
- **Not** a way to grant standing access — the token is one run's projection, bounded by expiry and revoke,
  not a login. **Not** an approval channel: an approval-waiting alert deep-links the *authenticated* console
  approval view, never a share link ([Alerting](/guides/alerting/), the `approvalWaiting` condition).

## Defaults

- **`includeContent`** defaults to `false` (metadata + status + structure only; no transcript).
- **`ttlHours`** defaults to **168** (7 days); the hard max is **2160** (90 days).
- Only **durably-stored** runs are shareable; a run held only in the hot store is refused.
- The trace id and spawn/handoff lineage are **omitted** from the projection.

## Failure modes

- **Run not found / not accessible / not durable** → the mint fails (a `403`/`404` no-oracle, or a refusal
  for a non-durable run).
- **Any bad public token** (missing / malformed / revoked / expired / deleted run) → a **uniform 404** — no
  distinction that could leak a link's existence.
- **Token lost** → mint a new link; the token is shown once and stored only as a hash (it cannot be
  recovered). Revoke the old one from the manage list.

## See also

- [Observability & tracing](/guides/observability-and-tracing/) (open the run first) ·
  [Record & replay](/guides/record-and-replay/) (a portable fixture vs a shareable projection)
- [Alerting](/guides/alerting/) (`approvalWaiting` — the authenticated approval deep-link) ·
  [Runs & execution](/concepts/runs-and-execution/) · [Security model](/concepts/security-model/)
