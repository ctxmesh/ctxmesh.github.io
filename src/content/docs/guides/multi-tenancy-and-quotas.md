---
title: Multi-tenancy & quotas
description: "Group namespaces into a Tenant, cap their compute + model spend / RPM / concurrency, and isolate them from each other."
---

**Goal:** group a set of namespaces into one governance unit with a shared compute quota, an aggregate
model budget / rate / concurrency cap, corpus-storage caps, and cross-tenant network isolation.

**Prerequisites:** the platform installed; cluster-scoped write access (a `Tenant` is **cluster-scoped**);
one or more namespaces your teams already deploy agents into ([Deploy an agent](/guides/deploy-an-agent/),
[Connect a model provider](/guides/connect-a-model-provider/)).

## What a Tenant does

A [`Tenant`](/reference/crd/tenant/) owns a set of namespaces — **a namespace belongs to at most one
tenant** — and caps their usage on three planes, each at a different enforcement point:

| Plane | Field | Enforced by |
|-------|-------|-------------|
| **Compute** (CPU / memory / pods) | `spec.quota` | a Kubernetes `ResourceQuota` reconciled onto each member namespace |
| **Model usage** (budget / RPM / concurrency) | `spec.model` | the launcher gateway proxy, against a shared cross-pod accumulator |
| **Isolation** | `spec.networkIsolation` | a cross-tenant-deny `NetworkPolicy` on each member namespace |

Tenant identity is **derived from namespace** everywhere downstream: the controller resolves
namespace → tenant, injects the tenant id + model caps into every member-namespace agent pod, and stamps
`tenantId` onto the run/trace path. There is no separate tenant key you pass around.

## 1. Author the Tenant

Because a `Tenant` is cluster-scoped, its `metadata` has **no namespace** — it *lists* the namespaces it
owns:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Tenant
metadata:
  name: team-acme               # cluster-scoped — no namespace here
spec:
  namespaces:                   # member namespaces (each belongs to ≤1 tenant)
    - acme-prod
    - acme-staging
  quota:                        # compute → a ResourceQuota per member namespace
    cpu: "20"                   # total REQUESTED cpu (a K8s quantity)
    memory: "40Gi"             # total REQUESTED memory
    pods: 50                    # pods per member namespace
  model:                        # enforced in the launcher gateway proxy (a shared accumulator)
    budgetUSD: "500.00"        # tenant-aggregate spend ceiling (hard → 402)
    rpm: 600                    # tenant-aggregate requests/minute (over cap → 429)
    maxConcurrent: 20           # tenant-aggregate in-flight model requests (streaming guard)
  storage:                      # corpus-storage caps across member namespaces
    corpusBytesSoftCap: "10Gi" # warns, never blocks
    corpusBytesHardCap: "20Gi" # blocks new corpus growth (upload → 413)
  networkIsolation: true        # cross-tenant-deny NetworkPolicy (secure by default)
```

Apply it:

```bash
kubectl apply -f team-acme.yaml
```

## 2. Watch it reconcile

```bash
kubectl get tenant team-acme -w
# NAMESPACES becomes 2 once both member namespaces are reconciled.
kubectl get tenant team-acme \
  -o jsonpath='{.status.memberNamespaces} {.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → 2 True
```

`status.memberNamespaces` counts only namespaces **actually** reconciled — a namespace already claimed by
another tenant is skipped and surfaced on a `NamespaceConflict` condition rather than double-stamped.

## 3. Confirm the caps landed

The compute quota is a plain `ResourceQuota` on each member namespace, and the model caps are injected into
each agent pod:

```bash
kubectl get resourcequota -n acme-prod
# a ResourceQuota reconciled from spec.quota (requests.cpu / requests.memory / pods)

kubectl get tenant team-acme \
  -o jsonpath='{.status.totalCorpusBytes}{"\n"}'
# aggregate KnowledgeBase corpus bytes across the tenant (reported when a storage cap is set)
```

Live model-spend / RPM / concurrency **consumption vs cap** is a console read (the Tenant detail panel
shows `$used / $cap`, `rpm / cap`, `inflight / cap`).

:::note
The BFF usage endpoint that backs the console panel is finalizing toward GA; the exact API path and its
degrade behavior (a hidden usage line when the state layer is unwired) may still change.
:::

## The isolation boundary

With `networkIsolation: true`, pods in a member namespace may reach **same-tenant** namespaces + the
platform (gateway, DNS, tracing) — but **not** other tenants' namespaces. To open a specific legitimate
cross-tenant path, list the other tenant by name:

```yaml
spec:
  networkIsolation: true
  peerTenants:
    - team-shared-services      # this tenant's namespaces may exchange traffic with team-shared-services
```

The model caps are the other half of isolation: a shared cross-pod accumulator means all of a tenant's
agents and replicas draw down **one** budget / rate bucket — one namespace can't quietly overrun a shared
provider budget on behalf of the tenant.

## When to use / when not

- **Use** to give a *set* of namespaces one shared compute ceiling, one aggregate model budget/rate cap,
  corpus-storage caps, and network isolation between teams on a shared cluster.
- **Not** for a *per-agent* cost ceiling — that is `AgentDeployment.spec.budget`
  ([Model routing & cost](/guides/model-routing-and-cost/)). **Not** for per-end-user limits — that is
  `GuardrailPolicy.userRateLimit` ([Guardrails](/guides/guardrails/)).

## Defaults

- `networkIsolation` is **`true` by default** (secure by default) — a new tenant isolates from birth; set
  it to `false` for a deliberate, condition-flagged opt-out.
- `spec.model.rpm` and `spec.model.maxConcurrent` default to `0` = **no cap**. An omitted `spec.quota`,
  `spec.model`, or `spec.storage` means that whole plane is unenforced — a tenant caps only what it sets.
- Storage caps are unset by default (no cap tracked or enforced).

## Failure modes

- **Model budget exceeded** → the next model call fails **closed** with a typed **`budget_exceeded`**
  (HTTP **402**, dimension `tenant`), aggregated across every agent and replica in the tenant. Money
  fails closed — a state-layer error on the hard-budget path denies rather than falling open.
- **RPM over cap** → the launcher returns HTTP **429** for calls over the tenant-aggregate rate.
- **Concurrency over `maxConcurrent`** → in-flight model requests over the semaphore are rejected.
- **Storage hard cap reached** → a corpus upload returns HTTP **413** (typed `storage_quota_exceeded`) and
  an ingestion run fails fast; a `StorageHardCapExceeded` condition is set. The **soft** cap only warns
  (`StorageSoftCapExceeded` + a Warning event), never blocks.
- **Contested namespace** → skipped and listed on the `NamespaceConflict` condition (never double-stamped).

:::note[Deployment control]
The caller-scoped model assumes the persona ClusterRoles (viewer / developer / operator) are bound
**per-namespace** (`RoleBinding`), not cluster-wide (`ClusterRoleBinding`). Bound cluster-wide, a
tenant-A principal could read tenant-B resources through a namespace-parameterized endpoint. See
[Tenancy operations](/operations/tenancy-operations/).
:::

## See also

- [Tenant reference](/reference/crd/tenant/) · [Tenancy operations](/operations/tenancy-operations/)
- [Model routing & cost](/guides/model-routing-and-cost/) (per-agent budgets) ·
  [Connect a model provider](/guides/connect-a-model-provider/) ·
  [Alerting](/guides/alerting/) (`budgetSoft` on a tenant)
- [Custom resources](/concepts/custom-resources/) · [Security model](/concepts/security-model/)
