---
title: High availability
description: "Control-plane replicas and PDBs, gateway N+1, the durable run worker, and State Layer HA."
sidebar:
  order: 5
---

The dev/kind default is single-replica everywhere — correct for a single-node cluster, where a second
replica lands on the same node and a `minAvailable` PDB would only **wedge** node drains. Production is
the opposite posture: every component that must survive a voluntary disruption (node drain, cluster
upgrade) runs highly available. This page is the operator's guide to turning that on and to the one
non-obvious coupling — **BFF HA requires the durable run store**.

## The one-command production posture

The chart ships a production overlay that satisfies every HA invariant self-consistently:

```bash
helm install ctxmesh ./deploy/helm/agent-engine \
  -f deploy/helm/agent-engine/values-production.yaml \
  [+ your own overrides]
```

Setting `profile: production` (which the overlay does) makes the HA invariants **hard**: `helm template`
**fails** unless the control plane is actually highly available — a reduced or half-configured posture
can never ship silently. The observable result: a wrong production install fails at `helm template` /
install time with an actionable message, not at 3 a.m. in production.

## What goes HA, and how

| Component | HA model | Dial |
|-----------|----------|------|
| **controller-manager** | Active/standby leader election — one leader reconciles, the rest fail over fast. | `controllerManager.replicas: 2` + `controllerManager.podDisruptionBudget.enabled: true` |
| **gateway** | Plain N+1 (stateless config-rendered proxy). | `gateway.replicas: 2` |
| **token-service** | Plain N+1 (stateless credential reader). | `tokenService.replicas: 2` |
| **state-layer proxy** | Plain N+1, but **load-bearing** — see below. | `statelayerProxy.replicas: 2` |
| **BFF / console** | N+1 **only with run dispatch** — see below. | `bff.replicas: 2` + `bff.runStore.enabled: true` |
| **run-worker** | KEDA-scaled with a warm floor. | `bff.runStore.worker.minReplicaCount: 2` |
| **PDBs (stateless components)** | Keep ≥1 pod through a drain. | `componentPodDisruptionBudgets.enabled: true` |

Enable each PDB **alongside** its component's `replicas ≥ 2`. A `minAvailable: 1` PDB on a 1-replica
Deployment wedges node drains — the replica dials exist precisely to make those PDBs usable. Each
component PDB renders only at `replicas ≥ 2`.

## The load-bearing state-layer proxy

As of the default cutover, agents route memory, quota, and dedup **through the state-layer proxy** and
hold no direct Valkey path. The budget check **fails closed** through that hop — so a proxy drain on a
single replica would return `402` to *every budget-capped agent* for the drain window. A production
install therefore **must** run the proxy with `replicas ≥ 2` + a PDB. The production overlay does this.

## The BFF HA gate (read this before scaling the BFF)

The BFF has **no replica dial by default**, on purpose. Its in-process run path is not HA-safe: with
`replicas > 1` and no durable store, in-process runs split across pods and some are **lost on a pod
loss**. HA requires the **durable run-worker** path:

1. Set `bff.runStore.enabled: true` — the BFF then **dispatches** runs to the run-worker (a separate
   Deployment that claims + executes queued runs against the run store) instead of running them
   in-process.
2. Provide an operator-created Secret (`bff.runStore.dsnSecretName`, key `dsn`) holding an **external,
   HA Postgres** DSN. The run store must not be a bundled dev instance.
3. Only then set `bff.replicas: 2`.

Under `profile: production` the render **fails** on `bff.replicas > 1` without dispatch — the guard
makes this coupling impossible to miss.

## State Layer HA is delegated, by design

The in-cluster Valkey is **single-instance**. Its optional persistence (AOF) gives durability across a
restart, but there is **no replication/failover** — a lost Valkey pod is a bounded state-layer outage
until it reschedules and replays its AOF. HA for the State Layer is **delegated to a BYO external
managed Redis/Valkey**, not built in-cluster (no Sentinel/Cluster in the chart — managed Redis HA is a
solved, operated product).

For an HA state layer: set `statelayer.externalAddr` to your managed endpoint, supply
`STATELAYER_USERNAME`/`STATELAYER_PASSWORD` from a Secret (never committed), and disable the in-cluster
Valkey (`devDataPlane.enabled: false`, `statelayer.persistence.enabled: false`). Replication, failover,
and backups become the managed service's job; the platform reconnects on the stable endpoint.

## Failure modes (bounded by design)

- **A single state-layer blip** degrades gracefully: session memory read/write fails **open**
  (best-effort); durable runs live in **Postgres**, not Valkey; **quota fails closed** (never fall open
  on money).
- **A controller failover** is a leader-election handover — reconciliation resumes on the standby.
- **A gateway / token-service pod loss** is absorbed by N+1; in-flight requests retry.
- **A run-worker pod loss** does not drop a run — the worker owns runs via the durable store; another
  worker re-claims. Keep a **warm floor** (`minReplicaCount ≥ 2`) so an interactive run never eats a
  scale-from-zero cold start, and a drain never zeroes the pool.

## Non-functional HA targets

Model Gateway availability targets 99.95% (HA, N+1); control-plane availability 99.9%. See
[Sizing & limits](/operations/sizing-and-limits/) for the full NFR table and its honest status.

## See also

- [Architecture in production](/operations/architecture-in-production/)
- [Backup & restore](/operations/backup-and-restore/)
- [Sizing & limits](/operations/sizing-and-limits/)
- [Helm values](/reference/helm-values/)
- [Production install](/operations/install-production/)
