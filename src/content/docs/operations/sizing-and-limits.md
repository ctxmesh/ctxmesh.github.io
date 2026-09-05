---
title: Sizing & limits
description: "Non-functional targets (cold start, gateway latency, scale ceiling) and the documented limits."
sidebar:
  order: 13
---

This page is the operator's reference for the platform's **non-functional targets** and the documented
limits you plan capacity against. Targets are design intent; where GA reality differs, it says so.

## Non-functional targets

| Requirement | Target |
|-------------|--------|
| Warm start (serving) | < 2s |
| Cold start from zero (serving) | < 30s (no runtime tool install) |
| Tool hot-reload propagation | < 5s (push-based) |
| Model Gateway added latency | p99 < 15ms (excluding provider time) |
| Model Gateway availability | 99.95% (HA, N+1) |
| Control-plane availability | 99.9% |
| Trace ingestion throughput | > 10,000 spans/sec per cluster (trace backend) |
| Trace durability / retention | Per-tenant TTL; encrypted at rest |
| Secret freshness | Latest backend value resolved per request; no redeploy |
| Multi-tenant isolation | No cross-tenant network reachability |
| Data in transit | mTLS for all agent-to-agent and agent-to-gateway traffic |
| Scale ceiling (v1 target) | ≥ 1,000 agents / ≥ 50 registries per cluster |
| License (core) | Apache 2.0 |

## Cold start and scale-to-zero

Agents run as Knative Services and **scale to zero** when idle. The cold-start target (< 30s) depends on
your image size and registry pull latency — the platform adds no runtime tool install to the path (tools
are MCP-mediated, not installed at boot). For latency-sensitive agents, keep a **warm floor** (a
non-zero min-scale) to avoid the scale-from-zero hop; the run-worker keeps its own warm floor
(`minReplicaCount ≥ 1`) so durable runs process from t=0. See [Scaling agents](/guides/scaling-agents/).

## Gateway latency and availability

The gateway adds a small, bounded hop (p99 < 15ms excluding provider time — this is *our* overhead, not
the model's). Run it N+1 (`gateway.replicas ≥ 2`) for the availability target. The budget-check hop
(state-layer proxy) **fails closed**, so size it for HA too — a single-replica drain 402s budget-capped
agents. See [High availability](/operations/high-availability/).

## Quotas and per-tenant limits

Tenant caps are the primary capacity guardrail: compute (`ResourceQuota`/`LimitRange`), monthly spend
(`402` over budget), RPM (`429`), and optional concurrency. Set them per tenant; watch live consumption
via `GET /api/tenants/{name}/usage`. See [Tenancy operations](/operations/tenancy-operations/).

## Documented limits

| Limit | Value / behavior |
|-------|------------------|
| AMP hop **depth** | Per-registry `maxDepth` (default 8) — a deeper call is rejected `depth_exceeded`. |
| AMP **hop budget** | Per-registry `hopBudget` (default 32) — decremented per hop; `hopBudget=N` permits exactly N hops. |
| AMP **cycles / self-calls** | Rejected `cycle_detected` (a self-call is the degenerate 1-cycle). |
| Registry membership | An agent is in **at most one** registry (v1). |
| Memory entry / body size | Oversize append → **413** (bounded body). |
| Session memory TTL | 24h, refreshed on every write. |
| Session-memory search | v1 = naive substring match (documented dev-grade; semantic search is phase-2). |
| Audit retention | `AUDIT_RETENTION_DAYS`, default 90. |
| Scale ceiling (v1 target) | ≥ 1,000 agents / ≥ 50 registries per cluster. |

## Honest status (pre-GA)

Several targets above are **consciously deferred** and reconciled to GA reality (each is properly
ADR'd — the target is design intent):

- **"mTLS for all agent-to-agent and agent-to-gateway traffic":** GA ships **NetworkPolicy isolation**
  (the registry mesh boundary + default-deny) **plus server-authenticated TLS on the credential hop**.
  Full **service-mesh mTLS + SPIFFE workload identity** is deferred to a production-hardening mesh
  install — the platform is mesh-*compatible*, not mesh-*bundled*. Provide it via your service mesh.
- **Trace "per-tenant retention TTL" / sampling / metadata-only mode:** GA ships always-on redaction +
  custom detectors; **sampling and retention TTL are provided today by your trace backend's own
  config** (ctxmesh emits OTLP; the backend governs).
- **The scale ceiling** (≥ 1,000 agents / ≥ 50 registries) is the **v1 target**, not a benchmarked
  guarantee — validate against your own workload and cluster.
- Availability numbers (99.95% / 99.9%) are the **HA design targets**; they hold only when you run the
  HA posture ([High availability](/operations/high-availability/)).

## See also

- [High availability](/operations/high-availability/)
- [Tenancy operations](/operations/tenancy-operations/)
- [Scaling agents](/guides/scaling-agents/)
- [Architecture in production](/operations/architecture-in-production/)
- [Security posture](/operations/security-posture/)
