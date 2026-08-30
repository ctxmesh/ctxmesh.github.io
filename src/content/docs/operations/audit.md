---
title: Audit
description: "The audit log: what's recorded, the viewer, retention, and the who / verb / resource model."
sidebar:
  order: 9
---

The audit trail answers *who connected, consented, mutated, or was denied what* — as a **persistent,
queryable, in-product surface**, not just a greppable log line. This page covers what is recorded, how to
read it, how access is gated, and retention.

## What's recorded

Two write sources feed one durable `audit_log` table (control-plane Postgres):

1. **Controller CRD mutations.** An informer on the platform CRDs emits an entry per create / update /
   delete. It runs on **every replica** and inserts idempotently (`ON CONFLICT DO NOTHING` on a
   deterministic dedup key), so N replicas observing the same mutation collapse to **one row**. The
   "who" is best-effort (the field-manager that owned the change).
2. **BFF caller-authenticated security events.** The BFF appends its precise, caller-attributed events —
   `connect` (and denied), `grant.create`, `grant.revoke` — with the **exact caller username** the
   controller can't attribute.

Both writes are **best-effort**: audit is observability, never a gate. The audited action always
proceeds; a DB write failure is logged and dropped (the always-on greppable log line is the durable
fallback).

## The record shape (who / verb / resource)

Each row carries non-secret context only:

| Field | Meaning |
|-------|---------|
| `occurred_at` | Timestamp. |
| `source` | `controller` or `bff`. |
| `actor` · `actor_kind` | Who (`user` / `controller` / `system`). |
| `action` | The verb (create / update / delete / connect / grant.create / grant.revoke / …). |
| `resource_kind` · `resource_name` · `namespace` | What, and where. |
| `outcome` | `success` / `denied` / `error` — **denials are recorded**, not just successes. |
| `trace_id` | Links to the run/trace view for the invoke that caused it. |
| `detail` | Structured non-secret context. |

## Reading the audit log

**In the console:** the **Audit** page (Observe section) renders when/actor/action/resource/namespace,
an outcome badge, source, and detail, with server-side actor/action/kind filters, keyset Prev/Next
paging, and a `trace_id` → trace deep-link. The nav item is **operator-only** (gated on `list
auditlogs`) and is hidden from developer/viewer chrome.

**Over the API:**

```
GET /api/audit?namespace=&actor=&action=&kind=&limit=&cursor=
→ { items: AuditEvent[], nextCursor }
```

Paging is a **keyset cursor** over `(occurred_at DESC, id DESC)` — not offset — because the table is
high-churn append-only and offset drifts under concurrent inserts. See [HTTP API](/reference/http-api/).

## Access is operator-only, caller-scoped

Audit read is gated by a **virtual RBAC resource** `auditlogs` (group `agents.ctxmesh.ai`, not a CRD).
The operator persona's `list auditlogs` grant **is** the audit-read policy. On each `GET /api/audit`, the
BFF runs a caller-scoped `SelfSubjectAccessReview` for `list auditlogs` in the requested namespace:

- a denial → **403** (never a fake empty `[]`);
- the SSAR namespace == the store filter namespace, so a caller can only read a namespace they're
  authorized for; an empty namespace is a cluster-wide check only a cluster-wide operator passes.

This is the same caller-scoped model as the rest of the console — the platform never elevates. See
[RBAC & personas](/operations/rbac/).

## Retention

A **leader-elected** pruner (one deleter, not a herd) deletes rows older than the retention window at
startup and then hourly, best-effort. Configure the window with:

```
AUDIT_RETENTION_DAYS   # default 90
```

The audit log is a **hot operational store**, not the multi-year compliance system-of-record — for
long-term archival, stream the same rows into your data warehouse.

## Operational signals

Prune health is exported on the manager `/metrics`: `agentry_audit_pruned_rows_total`,
`agentry_audit_prune_failures_total`, `agentry_audit_prune_last_success_seconds`,
`agentry_audit_dropped_rows_total`. Alert on rising `prune_failures_total` or a stalled
`prune_last_success_seconds` (retention lag / DB down), and on `dropped_rows_total` (audit write
back-pressure).

## Failure modes

- **Store unconfigured** (no control-plane DSN): `GET /api/audit` returns **501** and the viewer shows a
  calm "not enabled" state — never a fake empty page. The controller/BFF write paths no-op; the
  greppable log still records.
- **Cross-replica duplicates:** collapsed by the deterministic dedup key.
- **DB write failure:** logged and dropped; the audited action still succeeds.

## See also

- [Security posture](/operations/security-posture/)
- [RBAC & personas](/operations/rbac/)
- [HTTP API](/reference/http-api/)
- [Backup & restore](/operations/backup-and-restore/)
- [Observability model](/concepts/observability-model/)
