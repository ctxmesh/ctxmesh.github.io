---
title: Tenant
description: Groups namespaces into a governance unit — compute quota, model budget / RPM / concurrency caps, and cross-tenant isolation.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `Tenant` · Scope: Cluster · shortName: `tnt`

## Overview

A `Tenant` groups a set of namespaces into a governance unit (1 namespace ∈ ≤1 tenant) and caps their
compute and model usage. The controller reconciles a ResourceQuota (compute) and a cross-tenant-deny
NetworkPolicy (isolation) onto each member namespace, and injects the tenant id + model caps into
member-namespace agent pods. Enforcement points: **Kubernetes ResourceQuota** (compute), the
**launcher gateway proxy** against a shared accumulator (model budget/RPM/concurrency), and
**NetworkPolicy** (isolation). Tenant identity is *derived from namespace* everywhere downstream. The
headline posture is **secure-by-default isolation**: `networkIsolation` defaults to `true` (a new
tenant isolates from birth). Cluster-scoped, so it labels its stamped resources with
`agents.ctxmesh.ai/tenant` and prunes them via a finalizer.

## When to use / when not

- **Use** to give a set of namespaces a shared compute cap, an aggregate model budget/rate cap, corpus
  storage caps, and cross-tenant network isolation.
- **Not** for per-agent budgets (that is `AgentDeployment.spec.budget`) or per-user limits (that is
  `GuardrailPolicy.userRateLimit`).

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.namespaces` | []string | No | — | Member namespaces (a namespace belongs to ≤1 tenant; a contested one is skipped + status-warned). Max 256, each 1–63 chars (set). |
| `spec.quota` | object | No | — | Compute ceiling reconciled as a ResourceQuota per member namespace. Omitted ⇒ no compute quota. |
| `spec.quota.cpu` | string | No | — | Total requested CPU cap (a K8s quantity, e.g. `20` or `20000m`). Validated as a quantity; empty allowed. |
| `spec.quota.memory` | string | No | — | Total requested memory cap (e.g. `40Gi`). Validated as a quantity; empty allowed. |
| `spec.quota.pods` | int64 | No | — | Pods per member namespace. Minimum 0. |
| `spec.model` | object | No | — | Model-usage ceiling enforced in the launcher gateway proxy. Omitted ⇒ no model quota. |
| `spec.model.budgetUSD` | string | No | — | Tenant-aggregate model-spend cap, decimal string e.g. `100.00`. Exceeding fails the next call closed (HTTP 402, `budget_exceeded`, dimension `tenant`). |
| `spec.model.rpm` | int32 | No | `0` | Tenant-aggregate requests/minute across all agents/replicas (shared token bucket). Over the cap ⇒ HTTP 429. 0 = no cap. Minimum 0. |
| `spec.model.maxConcurrent` | int32 | No | `0` | Tenant-aggregate in-flight model requests (shared semaphore). 0 = no cap. Minimum 0. |
| `spec.storage` | object | No | — | Corpus storage quota (sum of KnowledgeBase corpus bytes across member namespaces). Two independent caps. |
| `spec.storage.corpusBytesSoftCap` | string | No | — | Soft cap (a K8s quantity, e.g. `10Gi`). Exceeding sets `StorageSoftCapExceeded` + a Warning event; **never blocks**. Empty ⇒ untracked. |
| `spec.storage.corpusBytesHardCap` | string | No | — | Hard cap (e.g. `20Gi`). At/over it sets `StorageHardCapExceeded` **and blocks new corpus growth** (upload ⇒ HTTP 413; ingestion fails fast). Empty ⇒ unenforced. |
| `spec.networkIsolation` | *bool | No | `true` | Stamp a cross-tenant-deny NetworkPolicy on every member namespace. **Secure by default** — absent is served as `true`; an explicit `false` is a deliberate opt-out. |
| `spec.peerTenants` | []string | No | — | Allowlist of OTHER tenant names whose namespaces may exchange traffic under isolation. Empty ⇒ strict (same-tenant + platform only). Max 64. |
| `spec.endUserIdentity` | object | No | — | A distinct end-user OIDC IdP for this tenant's agents' `/chat` runtime. The issuer MUST differ from the console/service-account issuer. |
| `spec.endUserIdentity.enabled` | bool | No | `false` | Turn on end-user OIDC login for this tenant's agent `/chat` origins. |
| `spec.endUserIdentity.issuer` | string | No | — | OIDC issuer URL. Must be `http(s)`; must not equal the console or cluster SA issuer. Max 512. |
| `spec.endUserIdentity.clientId` | string | No | — | OIDC client (audience) the end-user SPA authenticates as (Auth-Code + PKCE). Max 256. |
| `spec.endUserIdentity.scopes` | []string | No | — | Extra OIDC scopes beyond `openid`. Max 32, each ≤128 chars. |
| `spec.endUserIdentity.allowedHosts` | []string | No | — | Agent origins enabled for end-user login (exact redirect-URI hosts). Empty ⇒ any of the tenant's agent origins. Max 256. |

### Validation rules (admission, CEL)

- `quota.cpu` / `quota.memory` / `storage.corpusBytes*Cap` must be empty or a valid Kubernetes quantity.

> The authoritative tenant label the controller stamps on every member namespace is
> `agents.ctxmesh.ai/tenant`.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |
| `status.memberNamespaces` | int32 | Count of namespaces actually reconciled (contested ones excluded). |
| `status.totalCorpusBytes` | int64 | Sum of KnowledgeBase corpus bytes across members (when a storage cap is set). |
| `status.conditions` | []Condition | `Ready=true` when every member namespace reconciled. `NamespaceConflict` lists skipped namespaces; `StorageSoftCapExceeded` / `StorageHardCapExceeded` warn/fire on corpus caps. |

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Tenant
metadata:
  name: team-acme
spec:
  namespaces:
    - acme-prod
    - acme-staging
```

### Fuller — compute + model + storage caps

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Tenant
metadata:
  name: team-acme
spec:
  namespaces:
    - acme-prod
  quota:
    cpu: "20"
    memory: "40Gi"
    pods: 50
  model:
    budgetUSD: "500.00"
    rpm: 600
    maxConcurrent: 20
  storage:
    corpusBytesSoftCap: "10Gi"
    corpusBytesHardCap: "20Gi"
  networkIsolation: true
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/) · [Architecture](/concepts/architecture/)
- Related: [ModelRoute](/reference/crd/modelroute/) · [KnowledgeBase](/reference/crd/knowledgebase/) ·
  [AgentDeployment](/reference/crd/agentdeployment/) (per-agent budget)
