---
title: Tenancy operations
description: "Operating tenants: quotas, protected namespaces, the usage API, and network isolation."
sidebar:
  order: 12
---

A **`Tenant`** groups namespaces and caps their compute, model spend, and request rate — governance
*above* namespace + registry isolation. This page is the operator's guide to running tenants: creating
them, the enforcement points, watching live consumption, isolation, and the **one deployment control**
the whole caller-scoped model depends on.

## The model — namespace is the tenancy unit

A `Tenant` (cluster-scoped) owns a set of namespaces; **one namespace belongs to exactly one tenant**,
controller-enforced. Tenant identity is derived from namespace everywhere — there is no parallel
`tenant` key on the memory/credential/run stores (the namespace already scopes them).

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Tenant
metadata: { name: team-alpha }
spec:
  namespaces: [alpha-prod, alpha-staging]   # each namespace ∈ ≤ 1 tenant
  quota:                                     # compute → K8s ResourceQuota / LimitRange
    cpu: "20"
    memory: 40Gi
    pods: 50
  model:                                     # enforced in our layer (state-layer accumulator)
    budgetUSD: "100.00"                      # tenant-aggregate spend ceiling (hard → 402)
    rpm: 600                                 # tenant-aggregate requests/min (→ 429)
    maxConcurrent: 40                        # optional concurrent-in-flight semaphore
  networkIsolation: false                    # opt-in cross-tenant-deny NetworkPolicy
status:
  namespaces: 2
  conditions: [{ type: Ready }]
```

## Enforcement — three points

| Dimension | Mechanism | Over cap |
|-----------|-----------|----------|
| **Compute** (cpu/mem/pods) | K8s `ResourceQuota` + `LimitRange` reconciled onto each member namespace. | K8s admission refuses the pod. |
| **Model spend** (budget) | A shared state-layer accumulator (`tenant:{id}:spend:{YYYY-MM}`), atomic add, pre-call. | **402 `budget_exceeded`** (dimension `tenant`). |
| **Request rate** (RPM) | A shared token bucket (`tenant:{id}:rpm:{window}`). | **429**. |
| **Concurrency** (optional) | A shared semaphore (`tenant:{id}:inflight`). | Held until a slot frees. |
| **Isolation** (opt-in) | A cross-tenant-deny `NetworkPolicy` on member namespaces (`spec.networkIsolation`). | Cross-tenant traffic refused at L3/L4. |

The spend/RPM/concurrency accumulators are **shared** across all of a tenant's agents and replicas
(atomic ops in the State Layer), so caps hold cluster-wide, not per-pod. The **budget path fails
closed** — a state-layer error on the hard-budget check denies (never fall open on money); RPM window
loss on a restart resets the window (acceptable for a soft rate). The budget is a recurring **monthly**
window with an operator reset, not a lifetime cap.

:::note
Tenant caps are enforced in ctxmesh's own layer, not by wiring tenancy into the gateway's runtime API —
so the gateway stays swappable. Enterprise/phase-2 adds LiteLLM DB-backed team/virtual keys,
cluster-per-tenant, and billing export.
:::

## Watching live consumption

The console tenant detail shows **used vs. cap** (spend `$x / $cap`, `rpm / cap`, `inflight / cap`), so
you can see who is about to be throttled. Over the API:

```
GET /api/tenants                       # list (filter by name OR namespace: ?q=)
GET /api/tenants/{name}                # detail
GET /api/tenants/{name}/usage          # live spend / rpm / inflight for one tenant
GET /api/tenants/usage                 # usage across tenants
```

Usage is caller-scoped (a viewer's `Get(Tenant)` 403 / a missing tenant's 404 surface honestly), reads
the **same** state-layer keys the enforcer writes, and returns **501** when no State Layer is wired
(honest degrade, never a 500). The list carries `namespaces` so you can answer "which tenant owns
namespace X?". See [HTTP API](/reference/http-api/).

## Protected namespaces

A denylist is **always refused** as a tenant member: `kube-system`, `kube-public`, `kube-node-lease`,
and the platform's own namespaces (`agentry`, `kourier-system`, `knative-serving`,
`langfuse`). Adding one to `spec.namespaces` routes it to `denied` with a `ProtectedNamespaceRefused`
condition — a Tenant can never fence the cluster's own DNS / control plane / platform behind a
default-deny policy.

## The deployment control you MUST get right

The whole caller-scoped model (every user-facing op runs on the caller's own token; the API server
enforces their RBAC) **assumes the persona ClusterRoles (viewer/developer/operator) are `RoleBinding`-bound
PER-NAMESPACE**, not `ClusterRoleBinding`-bound cluster-wide. Bound cluster-wide, a tenant-A principal
could pass tenant-B's namespace to a namespace-parameterized read and enumerate B's resources — their
SSAR passes because their RBAC is cluster-wide.

**Bind each persona per member namespace.** This is a deployment control, not a code toggle. See
[RBAC & personas](/operations/rbac/).

```bash
# Per-namespace binding — the correct, tenant-safe form.
kubectl create rolebinding alpha-ops \
  --clusterrole=ctxmesh-operator \
  --user=ops@example.com \
  --namespace=alpha-prod
```

## Namespace moves

Moving a namespace between tenants is a **disruptive, admin-gated** operation: it is annotation-gated
intent, tenant caps lag by one reconcile + rollout (documented, bounded, never silent), and the spend
ledger is re-attributed on move.

## Honest status (pre-GA)

- **Shipped:** the `Tenant` CRD, compute + spend + RPM + concurrency enforcement, protected-namespace
  refusal, the live-usage read surface, opt-in cross-tenant NetworkPolicy.
- **Known accepted gaps:** **A2A amplification** (one user request → N downstream LLM calls, all
  counting against RPM) is accepted for open-core. The spoofable-namespace-label **admission webhook**
  (so only the controller sets the tenant label) is a hardening item — the tenant-label
  `ValidatingWebhook` is default-on in production (proven no-wedge), with an explicit opt-out
  acknowledgment.
- **Enterprise/phase-2:** LiteLLM DB-backed team/virtual keys, cluster-per-tenant, billing export, a
  signed tenant claim at the credential plane.

## See also

- [Multi-tenancy & quotas](/guides/multi-tenancy-and-quotas/)
- [RBAC & personas](/operations/rbac/)
- [HTTP API](/reference/http-api/)
- [Tenant](/reference/crd/tenant/)
- [Security posture](/operations/security-posture/)
