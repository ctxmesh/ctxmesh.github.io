---
title: Architecture in production
description: "Where state lives, the data plane you bring, and the integrated-not-operated stores model."
sidebar:
  order: 4
---

A production install is the same platform as the dev install with two things changed: the **data plane
moves out of the cluster** to services you operate, and the **HA / hardening dials are turned on**. This
page is the operator's map of *what runs*, *where every piece of state lives*, and *what you bring vs.
what the chart owns* — so you can reason about blast radius, backups, and failure domains before you go
live.

## The integrated-not-operated principle

ctxmesh **integrates** stateful infrastructure; it does not **operate** it (PRD §23). The dev/trial
install bundles a Valkey, a MinIO object store, and Postgres for convenience — with **deterministic dev
credentials, never real secrets**. In production you turn the bundled data plane off
(`devDataPlane.enabled: false`) and point the platform at managed/external services whose availability,
replication, and backups are that service's job. The chart's role is to *reference* your data plane, not
to run a database it can't operate well.

This keeps the platform's own footprint stateless and restart-safe, and puts durability where it
belongs — on infrastructure your team already knows how to run.

## The control plane (what the chart owns)

These are the stateless, chart-owned components that come up on `helm install`:

| Component | Role | State | HA model |
|-----------|------|-------|----------|
| **controller-manager** | The operator: reconciles every CRD into running agents, gateway config, policies, tenants. | None (reconciles from the API server) | Active/standby via `--leader-elect`; `replicas: 2+` is a warm failover. |
| **gateway** | The model gateway (LiteLLM) — routes model calls, injects provider keys, enforces budgets. Agents never hold keys. | Config-rendered from `ModelRoute`/`SecretBinding` (a ConfigMap) | Stateless; `replicas: 2+` is plain N+1. |
| **BFF / console** | Serves the SPA and the `/api` surface; caller-scoped (acts as *your* identity). | None (reads via the caller's token; runs offloaded to the run store) | `replicas: 2+` **requires** the durable run-worker (below). |
| **token-service** | The credential plane — resolves per-user OBO tokens for tool calls. | None (reads the credential store) | Stateless; `replicas: 2+` is plain N+1. |
| **state-layer proxy** | The fail-closed hop agents route memory / quota / dedup through (agents hold no direct Valkey path). | None (proxies to the state layer) | Stateless but **load-bearing**: a drain of a single replica 402s budget-capped agents. `replicas: 2+` required in production. |
| **run-worker** | Claims and executes queued / durable runs from the run store (workflows, long runs). | None (owns runs via the durable store) | KEDA-scaled on backlog with a warm floor (`minReplicaCount ≥ 1`). |

## The data plane (what you bring)

| Store | Holds | Consequence if lost | Recommended production form |
|-------|-------|--------------------|-----------------------------|
| **Control-plane Postgres** | Durable runs, prompt / agent versions, datasets + labels, cost rollups, the audit log. | The durable system-of-record for runs, versions, and audit. | A managed / HA Postgres; connected via `CONTROLPLANE_DSN` and the run-store DSN Secret. |
| **State Layer (Valkey / Redis)** | Session memory, tenant spend / RPM / concurrency accumulators, dedup keys. | A bounded, graceful degrade — session reads/writes fail *open* (best-effort); **quota fails *closed***. Durable runs live in Postgres, not here. | Managed / HA Redis / Valkey via `statelayer.externalAddr` + credentials from a Secret. |
| **Object store (S3-compatible)** | Blobs, datasets, replay fixtures, checkpoints. | Loss of recorded fixtures / large artifacts. | Your S3-compatible bucket. |
| **Trace backend (Langfuse / any OTLP sink)** | Trace trees, spans, token / cost detail, online-scoring source. | Loss of trace history (agents unaffected — tracing is best-effort). | Your OTLP collector → your backend. See [Observability backends](/operations/observability-backends/). |

:::note
Durability is decoupled from the State Layer on purpose: a conversation that must survive a state-layer
restart is checkpointed with its **run** in Postgres. Losing the in-cluster Valkey is a bounded outage,
not data loss.
:::

## The agent data plane

Agents run as Knative Services (the serving execution model) with the **launcher as PID 1** — the
un-forgeable in-pod enforcement point for guardrails, tool brokering, memory scoping, and on-behalf-of
credentials. The launcher-injected sidecars (OTel collector, tool-discovery, OBO egress) and the
reserved localhost plane are documented in [Launcher endpoints](/reference/launcher-endpoints/) and
[The launcher contract](/concepts/the-launcher-contract/).

Cross-registry isolation is enforced at the network layer (NetworkPolicy, requires a
NetworkPolicy-enforcing CNI) **and** at the app layer (the callee's launcher rejects a foreign
`registryId`) — defense in depth. See [Multi-agent](/concepts/multi-agent/).

## The edge

Everything the platform serves — the console / BFF, the trace UI, agents — is reached through **one
host-routed edge** (a Gateway API `Gateway` + `HTTPRoute`s), values-driven and identical local → prod
(config differs, not shape). `cert-manager`, `external-dns`, and the load balancer are cluster
controllers you install out of band; the chart references them. See
[Production install](/operations/install-production/) and [Helm values](/reference/helm-values/).

## Honest status (pre-GA)

- **Shipped:** the stateless control plane, the BYO data-plane seams, NetworkPolicy isolation, the
  edge, the durable run path, the state-layer proxy cutover.
- **Via standard tooling:** external secret managers via the External Secrets Operator; pod-to-pod
  mTLS via your service mesh; image-signature enforcement via a cluster admission policy.
- **Post-GA:** full service-mesh mTLS + SPIFFE as a bundled default; in-cluster state-layer HA is
  delegated to managed Redis by design. Some chart coordinates finalize toward GA.

## See also

- [Production install](/operations/install-production/)
- [High availability](/operations/high-availability/)
- [Backup & restore](/operations/backup-and-restore/)
- [Helm values](/reference/helm-values/)
- [Architecture](/concepts/architecture/) · [Custom resources](/concepts/custom-resources/)
