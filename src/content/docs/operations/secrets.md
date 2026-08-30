---
title: Secrets
description: "SecretBinding plus External Secrets Operator recipes (Vault / AWS IRSA / GCP Workload Identity), and the etcd-encryption prerequisite."
sidebar:
  order: 7
---

There are two kinds of secret in ctxmesh, and they are handled by two different mechanisms. This page is
about the first: **provider credentials** — the model-provider API keys the gateway injects at call
time. (The second — per-user *tool* credentials — lives in the credential store; see
[Credential stores](/operations/credential-stores/).)

The core invariant: **agents never hold provider keys.** All model calls go through the gateway, which
injects the key from a `SecretBinding` at call time. An agent pod receives the gateway URL and its route
alias — never the credential, in env or on a volume.

## How a provider key reaches the gateway

A `SecretBinding` references a Kubernetes Secret; a `ModelRoute` references the binding:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: SecretBinding
metadata:
  name: anthropic-key
  namespace: my-team
spec:
  backend: kubernetes            # native backend
  secretRef:
    name: anthropic-api-key      # a Kubernetes Secret in the same namespace
    key: api-key
---
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: default-model
  namespace: my-team
spec:
  providers:
    - provider: anthropic
      model: claude-sonnet-4-6
      priority: 1
      secretBindingRef: anthropic-key
```

The gateway controller resolves the binding, injects the Secret as an env var **on the gateway
Deployment only**, and references it from the LiteLLM config as `os.environ/…`. The value is never
rendered inline and never reaches an agent pod. See [Connect a model provider](/guides/connect-a-model-provider/)
and the [SecretBinding](/reference/crd/secretbinding/) / [ModelRoute](/reference/crd/modelroute/) pages.

:::note
The `SecretBinding` field is `secretBindingRef` (not `modelRouteRef`). A route references a binding by
name; a binding references a Kubernetes Secret by name + key.
:::

## Prerequisite: encryption at rest

The native backend stores the credential as a **Kubernetes Secret**, which assumes you have enabled
**etcd encryption at rest** on the cluster. This is a **cluster prerequisite and your responsibility** —
ctxmesh cannot enable it for you. Without it, a Secret is base64, not encrypted, in etcd. Enable it
before binding real provider keys.

## External secret managers (Vault / AWS / GCP)

ctxmesh does **not** re-implement a secret-manager integration for the native `SecretBinding`. External
managers integrate through the **[External Secrets Operator](https://external-secrets.io/) (ESO)** — the
standard CNCF tool — which **syncs** a secret from your manager into a Kubernetes Secret in the target
namespace; the `SecretBinding` then reads that synced Secret exactly as above. The manager stays the
source of truth; ESO keeps the K8s Secret fresh; ctxmesh reads it live.

### Vault

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata: { name: vault, namespace: my-team }
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "ctxmesh"
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: anthropic-api-key, namespace: my-team }
spec:
  secretStoreRef: { name: vault, kind: SecretStore }
  target: { name: anthropic-api-key }        # the K8s Secret SecretBinding reads
  data:
    - secretKey: api-key
      remoteRef: { key: providers/anthropic, property: api-key }
```

### AWS Secrets Manager (IRSA)

Use an ESO `SecretStore` with the `aws` provider and `auth.jwt.serviceAccountRef` bound to an IRSA
service account (the pod assumes the IAM role via its projected token — no static AWS keys in-cluster).
The `ExternalSecret` target is the K8s Secret the `SecretBinding` reads.

### GCP Secret Manager (Workload Identity)

Use an ESO `SecretStore` with the `gcpsm` provider authenticated via **Workload Identity** (the
Kubernetes SA is bound to a GCP service account; no static GCP key in-cluster). Same shape: the
`ExternalSecret` writes the K8s Secret, the `SecretBinding` reads it.

:::note
Exact ESO field names track the External Secrets Operator's own API, not ctxmesh — follow ESO's docs for
your version. ctxmesh only requires that a Kubernetes Secret with the expected `name`/`key` exists in the
binding's namespace.
:::

## Rotation

For the native backend, the gateway controller folds the Secret's `resourceVersion` into its config
hash, so a rotated Secret **rolls the gateway** to pick up the new value (approximating
per-request freshness for the Kubernetes backend). With ESO, a rotation in your manager syncs to the K8s
Secret on ESO's refresh interval, then rolls the gateway. Rotate a *connected-provider* key from the
console with `POST /api/providers/{name}/rotate` (see [HTTP API](/reference/http-api/)).

## What must never be committed

Provider keys, DSNs, KEKs, and the capability private seed are **never** committed to git — supply them
at install via `--set` or a values file kept out of source control, or (better) via ESO / a Secret you
create out of band. The chart's `bff-capability` private seed is generated in-cluster and never leaves
it.

## See also

- [Security posture](/operations/security-posture/)
- [Credential stores](/operations/credential-stores/)
- [Connect a model provider](/guides/connect-a-model-provider/)
- [SecretBinding](/reference/crd/secretbinding/) · [ModelRoute](/reference/crd/modelroute/)
