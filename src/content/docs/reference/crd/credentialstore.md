---
title: CredentialStore / ClusterCredentialStore
description: Selects the credential backend (Kubernetes / Postgres / OpenBao / remote) for MCP on-behalf-of user grants — a config choice, not a rebuild.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `CredentialStore` (Namespaced) / `ClusterCredentialStore` (Cluster)
> · shortNames: `credstore` / `clustercredstore`

## Overview

`CredentialStore` selects the credential backend used for MCP **on-behalf-of (OBO)** user grants in its
own namespace, overriding the cluster default. `ClusterCredentialStore` is the cluster-wide default,
used for any namespace without its own `CredentialStore`. Both share the same spec/status. Modeled on
the External Secrets Operator's SecretStore / ClusterSecretStore, the backend is a config choice, not a
rebuild. Enforcement point: the **token-service**, which constructs and health-checks the selected
backend and does the OAuth refresh; agent pods hold no backend credentials. When no
`ClusterCredentialStore` exists, the token-service defaults to the `kubernetes` backend.

Exactly one provider must be set. This is a **discriminated union** — set `kubernetes`, `postgres`,
`openbao`, or `remote` (never more than one).

## When to use / when not

- **Use** `ClusterCredentialStore` to set the cluster-wide default backend for OBO grants.
- **Use** `CredentialStore` to override the backend for a specific namespace.
- **Not** for provider API keys (LLM keys) — those are [`SecretBinding`](/reference/crd/secretbinding/).

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.provider` | object | **Yes** | — | The backend union — exactly one of the four below is set. |

### Provider: `kubernetes` (the zero-dependency default)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.provider.kubernetes.credentialNamespace` | string | No | token-service default | Overrides the locked namespace holding per-user grant Secrets. Empty ⇒ `TOKEN_SERVICE_CREDENTIAL_NS`. |

### Provider: `postgres` (the scale profile)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.provider.postgres.dsnSecretRef` | object | **Yes** | — | Secret + key holding the Postgres connection string (`name` + `key`). |
| `spec.provider.postgres.encryption` | object | No | — | Envelope encryption of stored tokens. A Postgres backend refuses to store plaintext — it **must** have a KEK. |

`encryption` requires exactly one KEK custodian:

| Field | Type | Description |
|-------|------|-------------|
| `spec.provider.postgres.encryption.localKEKSecretRef` | object | A 32-byte AES-256 master KEK (Secret + key); per-tenant keys HMAC-derived. Encryption-at-rest, not crypto-shred (dev/default). |
| `spec.provider.postgres.encryption.openBaoTransit` | object | Wrap DEKs with a named per-tenant OpenBao transit key (the KEK never leaves OpenBao; crypto-shred = delete the transit key). |
| `spec.provider.postgres.encryption.kmsV2` | object | A Kubernetes KMS v2 provider (generic; single-key per plugin). |

`openBaoTransit` fields: `address` (required), `tokenSecretRef` (required), `mountPath` (default
`transit`), `keyPrefix`, `caSecretRef`. `kmsV2` fields: `endpoint` (required), `keyIDPrefix`.

### Provider: `openbao` (OpenBao/Vault)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.provider.openbao.address` | string | **Yes** | OpenBao/Vault API address (e.g. `https://openbao.cred.svc:8200`). |

### Provider: `remote` (bring-your-own vault, over JSON-over-mTLS)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.provider.remote.endpoint` | string | **Yes** | Provider HTTPS base URL (e.g. `https://cred-backend.acme.svc:8443`). |
| `spec.provider.remote.mtls.caSecretRef` | object | **Yes** (if mtls) | CA bundle (Secret + key) verifying the provider's server cert. |
| `spec.provider.remote.mtls.clientTLSSecretName` | string | **Yes** (if mtls) | A `kubernetes.io/tls` Secret (tls.crt + tls.key) — the client cert the token-service presents. |

### Validation rules (admission, CEL)

- Exactly one provider (`kubernetes` / `postgres` / `openbao` / `remote`) must be set.
- Under `postgres.encryption`, exactly one KEK custodian (`localKEKSecretRef` / `openBaoTransit` / `kmsV2`).

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Backend selection/health. `Ready=True` once the token-service constructs and health-checks the selected backend. |

## Examples

### Kubernetes backend (namespaced)

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: CredentialStore
metadata:
  name: default
  namespace: my-team
spec:
  provider:
    kubernetes: {}
```

### Cluster-wide Postgres backend with a local KEK

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ClusterCredentialStore
metadata:
  name: cluster-default
spec:
  provider:
    postgres:
      dsnSecretRef:
        name: cred-postgres-dsn
        key: dsn
      encryption:
        localKEKSecretRef:
          name: cred-kek
          key: kek
```

### Remote backend over mTLS

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: CredentialStore
metadata:
  name: byo-vault
  namespace: my-team
spec:
  provider:
    remote:
      endpoint: https://cred-backend.acme.svc:8443
      mtls:
        caSecretRef:
          name: cred-ca
          key: ca.crt
        clientTLSSecretName: cred-client-tls
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [SecretBinding](/reference/crd/secretbinding/) (provider API keys) ·
  [MCPToolBinding](/reference/crd/mcptoolbinding/) (tools that use OBO credentials)
