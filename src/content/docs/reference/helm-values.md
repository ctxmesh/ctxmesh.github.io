---
title: Helm values
description: "Chart values — replicas and PDBs, dev vs. external state, State Layer persistence, the production profile, images, and kill-switches."
---

The chart renders **byte-for-byte the same** resources as the base manifests with **default values**
(the `make helm-verify` no-drift gate). Every production hardening is a **values-gated dial defaulting to
off/dev**, so turning one on renders the extra resources and leaving it off renders nothing extra. This
page is the values reference.

The fastest path to a correct production posture is the shipped overlay:

```bash
helm install ctxmesh ./deploy/helm/ctxmesh \
  -f deploy/helm/ctxmesh/values-production.yaml \
  [+ your own overrides]
```

:::note
Values below are confirmed against the chart. Some downstream coordinates (registry paths, external
endpoints) are install-specific and you supply them. Confirm on your cluster with `helm show values`.
:::

## Profile & security

| Value | Default | Meaning |
|-------|---------|---------|
| `profile` | `""` (dev) | `production` makes the HA invariants **hard** — `helm template` **fails** unless the control plane is actually HA (state-layer proxy, BFF, run-worker all ≥2, dispatch on, no bundled dev data plane). |
| `security.tenantLabelWebhook.enabled` | `true` | The tenant-label `ValidatingWebhook` (forbids a non-controller principal from changing a namespace's `agents.ctxmesh.ai/tenant` label). Boots its own in-process cert controller (no cert-manager). |
| `security.tenantLabelEnforcement` | `""` | Opt-out ack. To run production **without** the webhook, set to the exact string `"unenforced-UNSAFE-acknowledged"` so a reduced posture can't ship silently. Ignored when the webhook is enabled or under the dev profile. |
| `namespace` | `ctxmesh` | Install namespace; must match the base manifests for no-drift. |

## Control plane

| Value | Default | Meaning |
|-------|---------|---------|
| `controllerManager.replicas` | `1` | Active/standby leader election; set `2+` for HA. |
| `controllerManager.podDisruptionBudget.enabled` | `false` | Opt-in PDB (`minAvailable` below). Enable alongside `replicas>1`. |
| `controllerManager.podDisruptionBudget.minAvailable` | `1` | |
| `controllerManager.image.repository` / `.tag` | `controller` / `""` (→ appVersion) | Point at a signed image in your registry, digest-pinned, for production. |

## Stateless request-servers (replicas, PDBs, images)

| Value | Default | Meaning |
|-------|---------|---------|
| `gateway.replicas` | `1` | Model gateway (stateless); `2+` = plain N+1. |
| `tokenService.replicas` | `1` | Credential plane (stateless); `2+` = plain N+1. |
| `tokenService.tls.required` | `false` | `true` ⇒ the credential plane refuses to serve plain HTTP (no silent downgrade). `production` requires `true`. |
| `tokenService.image.repository` / `.tag` | `token-service` / `""` | Signed image in production. |
| `statelayerProxy.replicas` | `1` | The **load-bearing** memory/quota hop; a single-replica drain 402s budget-capped agents. Production **must** set `≥2`. |
| `statelayerProxy.image.repository` / `.tag` | `statelayer-proxy` / `""` | Signed image in production. |
| `componentPodDisruptionBudgets.enabled` | `false` | PDBs for bff / gateway / token-service / statelayer-proxy. Enable alongside their `replicas≥2` (each renders only at `≥2`). |
| `componentPodDisruptionBudgets.minAvailable` | `1` | |

## BFF / console

| Value | Default | Meaning |
|-------|---------|---------|
| `ui.enabled` | `true` | Serve the console SPA + `/api`. `false` = headless control plane. |
| `bff.replicas` | `1` | **`>1` requires `runStore.enabled`** (dispatch) — else in-process runs split across pods and are lost on a pod loss; the render fails on `>1` without dispatch. |
| `bff.image.repository` / `.tag` | `bff` / `""` | Signed image in production. |
| `bff.runStore.enabled` | `false` | Durable run store + HA run-worker: the BFF dispatches runs to a separate worker. Requires a Secret (`dsnSecretName`, key `dsn`) with the run-store Postgres DSN. |
| `bff.runStore.dsnSecretName` | `run-store` | The run-store DSN Secret name (create it with a managed-Postgres DSN). |
| `bff.runStore.worker.concurrency` | `4` | Concurrent claim loops per worker pod. |
| `bff.runStore.worker.minReplicaCount` | `1` | KEDA min **and** the Deployment warm floor. `0` opts into scale-to-zero; production uses `2`. |
| `bff.runStore.worker.maxReplicaCount` | `10` | KEDA max on queued-run backlog. |
| `bff.costRollupEnabled` | `"1"` | Cost-rollup worker (feeds `/api/cost` + chargeback). `"0"` disables. |
| `bff.consoleURL` | `""` | The canonical browser-reachable console origin (MCP-consent redirect_uri + cross-origin relay target). Set to your console edge host in production. |
| `bff.providerConnect.enabled` | `true` | Connect-a-provider flow. `false` (hardened) → the connect endpoints 404. |
| `bff.generation.platformModels` | `""` | Comma-separated governed generation models (empty = unpinned caller model). |
| `bff.mcp.enabled` | `true` | BYO-MCP register/discover. `false` (hardened) → the endpoints 404. |
| `bff.mcp.requireApproval` | `false` | `true` (hardened) → newly registered MCP tools are pending-approval. |
| `bff.mcp.credentialNamespace` | `""` | Set (e.g. `ctxmesh-credentials`) to render a locked platform namespace holding MCP grant Secrets so tenants can't read each other's OAuth tokens. **Production should set this.** |

## Console login (OIDC/SSO via bundled Dex)

Off by default (token login is the OSS default). Enable to bundle Dex.

| Value | Default | Meaning |
|-------|---------|---------|
| `auth.oidc.enabled` | `false` | Bundle Dex + the console OIDC client. |
| `auth.oidc.issuer` | example URL | The Dex issuer — must match the API server `--oidc-issuer-url` byte-for-byte. |
| `auth.oidc.client.id` / `.redirectURIs` | console defaults | The SPA OAuth client (Auth-Code + PKCE, public client). |
| `auth.oidc.staticUser.*` | dev demo user | Zero-config demo login — **dev/trial only**, change before exposing Dex. |
| `auth.oidc.connectors` | `[]` | Federated IdP connectors (enterprise; Google/Azure/Okta/GitHub/LDAP/SAML). |
| `auth.oidc.langfuse.*` | off | Register the trace UI as a second client of this Dex (shared login). |
| `auth.oidc.demoBinding` / `.usernamePrefix` | `true` / `oidc:` | Example ClusterRoleBinding for the demo user; prefix must match `--oidc-username-prefix`. |

:::note
The **load-bearing** OIDC step is a cluster-admin one: the API server must be told to **trust the Dex
issuer** (`--oidc-*` flags). The chart ships Dex + the client but cannot set apiserver flags. On a
managed cluster that can't set them, keep token login — that is not a regression.
:::

## Data plane

| Value | Default | Meaning |
|-------|---------|---------|
| `devDataPlane.enabled` | `true` | Bundled in-cluster Valkey + MinIO with **deterministic dev creds** (dev/trial only). Production: `false` + BYO external. |
| `statelayer.externalAddr` | `""` | BYO external Valkey/managed Redis `host:port` for the state-layer backend. `production` requires this **or** persistence.enabled. |
| `statelayer.persistence.enabled` | `false` | Optional in-cluster **persistent** state layer (StatefulSet + PVC + AOF). Enable **together with** `devDataPlane.enabled: false` (a pod-selector collision fails loud otherwise). One-way migration — see [Upgrade & versioning](/operations/upgrade-and-versioning/). |
| `statelayer.persistence.size` | `8Gi` | PVC size for AOF/RDB. |
| `statelayer.persistence.storageClassName` | `""` (cluster default) | Prefer a network-attached class — a RWO local volume pins the pod to one node. |
| `statelayer.persistence.cpuLimit` | `"1"` | CPU limit on the Valkey container. |

:::note[Security posture]
The in-cluster Valkey is **unauthenticated by design** — a self-host convenience tier (isolation is
ClusterIP + key-prefix scoping + the opt-in cross-tenant NetworkPolicy; no protocol-level per-tenant
data isolation). `requirepass` is declined (the Knative constraint would make the password broadly
readable → security theater). For **sensitive multi-tenant production data, use BYO-external
Valkey/managed Redis** with real, operator-managed auth.
:::

## Images the controller injects into agent pods

| Value | Default | Meaning |
|-------|---------|---------|
| `controllerManager.injectedImages.collector` | `""` | The OTel collector sidecar image. Empty ⇒ dev.local default (ImagePullBackOff off a real cluster) — **production must set** this, digest-pinned. |
| `controllerManager.injectedImages.discovery` | `""` | The tool-discovery sidecar image. Same requirement. |
| `controllerManager.oboEgress.enabled` | `false` | On-behalf-of egress-sidecar injection (per-user tool calls). Set `true` + `sidecarImage` for a working OBO install. |
| `controllerManager.oboEgress.sidecarImage` | `""` | The egress sidecar image. |
| `controllerManager.oboEgress.capabilityAudience` / `.tokenServiceURL` | `""` | Audience / token-service URL (the URL is derived by default). The capability public key comes from the `bff-capability` Secret, **not** here. |

## Install hooks (GA Gate A)

| Value | Default | Meaning |
|-------|---------|---------|
| `capabilityKey.generate` | `true` | A post-install/upgrade hook generates the platform Ed25519 keypair into `bff-capability` **iff absent** (never re-keys). Set `false` to BYO. |
| `preflight.enabled` | `true` | A post-install/upgrade Job fails LOUD on an incoherent config (empty required env, mismatched keypair, unreachable control-plane store). |

## Prometheus & NetworkPolicy (opt-in)

| Value | Default | Meaning |
|-------|---------|---------|
| `prometheus.serviceMonitor.enabled` | `false` | ServiceMonitor for the manager HTTPS metrics (`:8443`). Requires the Prometheus Operator CRDs. |
| `prometheus.serviceMonitor.insecureSkipVerify` | `true` | Set `false` + cert-manager TLS in production. |
| `prometheus.podMonitor.queueProxy.enabled` | `false` | Knative queue-proxy request metrics (feeds AlertPolicy SLOs). Also needs Knative export configured. |
| `prometheus.podMonitor.queueProxy.port` / `.interval` | `http-usermetric` / `15s` | |
| `prometheus.runPipeline.enabled` | `false` | Run-pipeline SLIs (BFF + run-worker metrics `:9092`) + a dead-worker-pool alert. |
| `prometheus.runPipeline.interval` / `.deadPoolFor` | `30s` / `5m` | |
| `networkPolicy.metricsIngress.enabled` | `false` | Restrict `/metrics` ingress to namespaces labeled `metrics: enabled` (needs a NetworkPolicy CNI). |

## CRDs

| Value | Default | Meaning |
|-------|---------|---------|
| `crds.install` | `true` | Install CRDs with the chart. `false` to manage CRD lifecycle out of band (a shared cluster where CRDs are pre-applied). |

## See also

- [Production install](/operations/install-production/)
- [High availability](/operations/high-availability/)
- [Upgrade & versioning](/operations/upgrade-and-versioning/)
- [Secrets](/operations/secrets/) · [Credential stores](/operations/credential-stores/)
- [Observability backends](/operations/observability-backends/)
