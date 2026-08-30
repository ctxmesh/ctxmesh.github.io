---
title: Production install
description: "Install ctxmesh on a real cluster — external state, TLS, and the production profile."
sidebar:
  order: 1
---

:::note[Docs in progress]
Exact chart coordinates, values, and version pins are published at general availability. This page
describes the intended production shape.
:::

The development install bundles Postgres, Redis/Valkey, and an object store for convenience. A
**production** install brings those as managed/external services and turns on the hardening dials.

## Prerequisites

- Kubernetes v1.31+ with **etcd encryption at rest** enabled.
- **Knative Serving** (for the serving execution model); KEDA if you use queue-depth scaling.
- **External state you bring:** a managed **Postgres** (control-plane state — runs, versions,
  datasets, cost), a managed **Redis/Valkey** (the State Layer for session memory), and an
  **S3-compatible object store** (blobs, datasets, checkpoints).
- A base domain + TLS (cert-manager or your ingress' certificates).
- At least one model provider key in your secret backend (or use the mock provider first).

## Install (overview)

```bash
# Illustrative — real coordinates published at release.
helm repo add ctxmesh https://charts.ctxmesh.ai
helm install ctxmesh ctxmesh/agentry \
  --namespace ctxmesh-system --create-namespace \
  --set profile=production \
  --set postgres.dsn=... \
  --set stateLayer.redis.addr=... \
  --set objectStore.endpoint=... \
  --set baseDomain=agents.example.com
```

The `profile=production` dial flips the platform from "integrated dev stores" to "bring-your-own,"
and turns on the availability guards (see [High availability](/operations/high-availability/)).

## What comes up

- The **CRDs** and the **controller** (operator).
- The **gateway** (model routing + budgets).
- The **console / BFF**.
- A **run worker** (durable run execution) — required in production.

## After install

1. Verify the control plane is `Available` with 0 restarts.
2. Apply your first [`ModelRoute` + `SecretBinding`](/guides/connect-a-model-provider/).
3. Bind [RBAC personas](/operations/rbac/) per namespace.
4. Wire your [trace backend](/operations/observability-backends/) and review the
   [security posture](/operations/security-posture/).

## See also

[High availability](/operations/high-availability/) · [Upgrade & versioning](/operations/upgrade-and-versioning/) · [Helm values](/reference/helm-values/) · [Secrets](/operations/secrets/)
