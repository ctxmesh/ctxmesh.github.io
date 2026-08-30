---
title: Credential stores
description: "The CredentialStore SPI (kubernetes / postgres / openbao / remote), KEK custody, and crypto-shredding."
sidebar:
  order: 8
---

When an agent calls an MCP tool **on behalf of the end user**, it uses that user's own credential — not
a shared blanket key. Those per-user tool grants live in the **credential store**: a config-selected,
pluggable backend, chosen with a `CredentialStore` / `ClusterCredentialStore` CRD. This page is the
operator's guide to picking a backend and a key-custody model.

Two independently swappable plug-points make up "the vault" — keep them orthogonal to avoid lock-in:

| Axis | Decides | Options |
|------|---------|---------|
| **A — store / resolver** | Where tokens live and who returns a fresh one. | `kubernetes`, `postgres`, `openbao` (in-tree) · any `remote` HTTP provider (BYO vault) |
| **B — key custody** | Where the KEK (key-encryption key) lives and where crypto happens. | local KEK · OpenBao transit (per-tenant, crypto-shred) · KMS v2 plugin (cloud KMS / SoftHSM) |

- **Default profile:** `kubernetes` store + a Kubernetes-Secret KEK — **zero external dependency**. A
  fresh install works air-gapped.
- **Recommended scale profile:** `postgres` store + OpenBao transit KEKs (per-tenant, crypto-shred).

## Selecting a backend

`ClusterCredentialStore` (cluster-scoped) is the default for the whole install; a namespaced
`CredentialStore` overrides it per namespace/tenant. Resolution: for a grant in namespace `N`, use the
`CredentialStore` in `N` if present, else the `ClusterCredentialStore`. Absent both, the platform
defaults to `kubernetes` — existing installs are unchanged.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ClusterCredentialStore
metadata: { name: default }
spec:
  provider:                     # exactly one
    kubernetes: {}              # zero-dep baseline (the default)
    # postgres:
    #   dsnSecretRef: { name: cred-postgres, key: dsn }
    #   encryption:                          # Axis B — exactly one KEK custodian
    #     openBaoTransit:                    # per-tenant keys + crypto-shred
    #       address: https://openbao.cred.svc:8200
    #       tokenSecretRef: { name: openbao-token, key: token }
    #       keyPrefix: "tenant-"
    #     # or: localKEKSecretRef: { name: cred-kek, key: kek }   (dev/default)
    #     # or: kmsV2: { endpoint: "unix:///var/run/kms/socket" } (generic, single-key)
    # openbao:
    #   address: https://openbao.cred.svc:8200
    # remote:
    #   endpoint: "https://cred-backend.acme.svc:8443"   # JSON-over-mTLS provider
    #   mtls: { caSecretRef: {...}, clientCertSecretRef: {...} }
```

## The backends

| Backend | Kind | When to use | Notes |
|---------|------|-------------|-------|
| `kubernetes` | in-tree | dev, trial, air-gapped | Grants as Kubernetes Secrets. Zero dependency. Passive (the platform owns freshness + envelope encryption). |
| `postgres` | in-tree | scale / multi-tenant | Grants in Postgres; pair with a real KEK custodian for encryption-at-rest + crypto-shred. |
| `openbao` | in-tree | OpenBao shops | Transit KEK + KV, or transit-only as the Axis-B custodian under another store. |
| `remote` | out-of-tree | BYO vault | Any HTTP server implementing the **JSON-over-mTLS `credprovider` contract** — an HTTP server + JSON + a client cert, in any language. |

The `remote` contract is a small, versioned JSON-over-mTLS surface (`/v1/resolve`, `/v1/store`,
`/v1/revoke`, `/v1/capabilities`, `/v1/health`) with a `X-Credprovider-Version` header. `consent_required`
and `no_credential` are **first-class response signals**, never masked as a generic error — the same
non-leak property the platform enforces everywhere.

## Key custody (Axis B) and crypto-shredding

For backends that don't encrypt their own storage, the platform does **envelope encryption**: a random
per-record DEK encrypts the token; the DEK is wrapped under a **per-tenant KEK** that never leaves its
custodian; storage holds `{ciphertext, wrapped_dek, nonce, key_id}`. A full store dump is **inert
without the KEK**. Crypto stays off the hot path — the KEK is only touched on a cache miss.

| Custodian | Encryption at rest | Per-tenant crypto-shred | Notes |
|-----------|--------------------|-------------------------|-------|
| **Local KEK** (Kubernetes Secret) | yes | **no** (keys are HMAC-derived from a master) | Dev/default. Back up the KEK Secret — see [Backup & restore](/operations/backup-and-restore/). |
| **OpenBao transit** | yes | **yes** — deleting the tenant's transit key makes that tenant's tokens permanently unrecoverable | Reference for the scale profile; the KEK never leaves OpenBao. |
| **KMS v2** (cloud KMS / SoftHSM) | yes | no (single-key per plugin) | KEK-in-KMS custody + rotation, but not per-tenant shred — advertised honestly. |

**Crypto-shredding** = GDPR / tenant-deletion erasure by **destroying the key**, not scanning and
deleting millions of rows. It is a Sealer capability, delivered by named-key custodians (OpenBao
transit, per-tenant cloud CMKs) — not by vanilla KMS v2.

## Invariants that hold for every backend

These are conformance-gated, not per-backend promises:

- **Per-user isolation** on a shared agent process — N concurrent distinct-user resolves → zero
  cross-attribution.
- **One-refresh-under-herd** — many concurrent resolves of one near-expiry grant trigger exactly one
  upstream refresh.
- **Fail-closed** — a backend/provider error yields **no credential** (never a bare or blank token
  upstream).
- **The raw token never enters the agent pod** — it is resolved sidecar-side by the token-service; the
  value is secret and never logged.
- **Central audit/provenance** — every resolve emits an audit event with the credential's provenance
  class regardless of backend. See [Audit](/operations/audit/).

## Deployment

The central **token-service** ships with the chart (no manual config). It reads grant Secrets, refreshes
/ revokes on the credential plane, and holds no agent-CRD access. In production, set
`tokenService.tls.required: true` so the credential plane refuses to serve plain HTTP; supply the mTLS
Secret (platform CA-signed server cert + the client CA that authenticates sidecars).

## Honest status (pre-GA)

- **Shipped:** `kubernetes` and `postgres` backends, local-KEK and OpenBao-transit custody, the
  conformance suite, the `remote` JSON-over-mTLS contract shape.
- **Post-GA / integration:** cloud-KMS-v2 plugins for KEK custody follow the standardized KMS v2
  contract; specifics of some `CredentialStore` provider sub-fields finalize toward GA — describe the
  shape, confirm field names with `kubectl explain credentialstore.spec` on your cluster.

## See also

- [Security posture](/operations/security-posture/)
- [Secrets](/operations/secrets/)
- [Audit](/operations/audit/)
- [Backup & restore](/operations/backup-and-restore/)
- [CredentialStore](/reference/crd/credentialstore/) · [Identity](/concepts/identity/)
