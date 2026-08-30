---
title: SecretBinding
description: Maps a logical binding name to a provider API credential in a Kubernetes Secret, injected only into the gateway pod.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `SecretBinding` · Scope: Namespaced · shortName: `sb`

## Overview

A `SecretBinding` maps a logical binding name to a provider API credential stored in a Kubernetes
Secret. The gateway controller resolves the credential at reconcile time and injects it into the
gateway Deployment as `SB_<sanitized-binding-name>`, which a [`ModelRoute`](/reference/crd/modelroute/)
provider entry references via `secretBindingRef`. Enforcement point: the **controller** (resolution)
and the **model gateway** (injection). The headline guarantee is credential isolation — **provider
keys are injected only into the gateway pod and never exposed to agent pods.**

## When to use / when not

- **Use** to hold a provider API key (e.g. an Anthropic or OpenAI key) referenced by a `ModelRoute`.
- **Not** for MCP on-behalf-of user credentials — those use [`CredentialStore`](/reference/crd/credentialstore/).
- **Not** for `mock` providers or keyless `apiBase` routes — those need no binding.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.backend` | string (enum) | No | `kubernetes` | Secret storage backend. Only `kubernetes` is supported today (Vault / AWS / GCP Secret Manager are phase-2). |
| `spec.secretRef` | object | **Yes** | — | Locates the Kubernetes Secret and key holding the credential (same namespace). |
| `spec.secretRef.name` | string | **Yes** | — | Name of the Kubernetes Secret. MinLength 1. |
| `spec.secretRef.key` | string | **Yes** | — | Key within the Secret's `data` map, e.g. `api-key`. MinLength 1. |

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state. The `Resolved` condition is `True` once the referenced Secret exists and the key is present. |

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: SecretBinding
metadata:
  name: anthropic-key
  namespace: my-team
spec:
  secretRef:
    name: anthropic-secret
    key: api-key
```

### With the Secret it points at

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: anthropic-secret
  namespace: my-team
type: Opaque
stringData:
  api-key: sk-ant-...        # never commit real keys
---
apiVersion: agents.ctxmesh.ai/v1beta1
kind: SecretBinding
metadata:
  name: anthropic-key
  namespace: my-team
spec:
  backend: kubernetes
  secretRef:
    name: anthropic-secret
    key: api-key
```

The gateway then exposes this as `SB_anthropic-key` (sanitized), referenced by a `ModelRoute`
provider entry with `secretBindingRef: anthropic-key`.

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [ModelRoute](/reference/crd/modelroute/) · [CredentialStore](/reference/crd/credentialstore/)
