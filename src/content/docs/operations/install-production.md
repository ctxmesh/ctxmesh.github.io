---
title: Production install
description: "Install ctxmesh on a real cluster — external state, TLS, and the production profile."
sidebar:
  order: 1
---

The development install bundles Postgres, Redis/Valkey, and an object store for convenience. A
**production** install brings those as managed/external services and turns on the hardening dials.

## Prerequisites

- Kubernetes v1.31+ with **etcd encryption at rest** enabled.
- **Knative Serving** (for the serving execution model); KEDA if you use queue-depth scaling.
- A managed **PostgreSQL** with the `pgvector` extension, for control-plane state: runs, versions,
  datasets, cost and knowledge chunks.
- A **TLS certificate for the token service**, valid for `ctxmesh-token-service.ctxmesh.svc`. In
  production it serves the credential API over TLS only, and does not start without one.
- At least one model provider key in your secret backend (or use the mock provider first).

The State Layer (Valkey, for session memory) runs in the cluster on a persistent volume by default;
to use a managed Redis or Valkey instead, add `--set statelayer.externalAddr=<host>:<port>`. This
release has no setting for an external object store, and the production profile does not deploy the
bundled one, so knowledge-base document upload does not work on a production install.

## Install

The production settings ship inside the chart, so pull it first:

```bash
helm pull oci://ghcr.io/ctxmesh/charts/ctxmesh --version 0.1.0-beta.8 --untar
kubectl create namespace ctxmesh
kubectl -n ctxmesh create secret tls token-service-tls --cert=token-service.crt --key=token-service.key
helm install ctxmesh ./ctxmesh \
  --namespace ctxmesh \
  --set profile=production \
  -f ctxmesh/values-production.yaml \
  --set postgres.externalDsn='postgres://user:pass@db.example:5432/ctxmesh?sslmode=require' \
  --set bff.mcp.grantHmacKey="$(openssl rand -hex 32)" \
  --set bff.mcp.credentialNamespace=ctxmesh-credentials
```

`bff.mcp.grantHmacKey` salts the hashed user identities on MCP grants; keep it, because changing it
later means everyone reconnects their accounts. `bff.mcp.credentialNamespace` is the namespace the
chart creates to hold those grants, readable only by the credential components.

The `profile=production` dial flips the platform from "integrated dev stores" to "bring-your-own,"
and turns on the availability guards (see [High availability](/operations/high-availability/)). The
render fails if the database, the grant key or the credential namespace is missing.

To serve the console on your own domain, put it behind your ingress and set `bff.consoleURL` to
its `https://` origin, so MCP sign-ins return to it.

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
