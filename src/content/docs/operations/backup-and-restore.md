---
title: Backup & restore
description: "pg_dump plus the KEK secret and a State Layer snapshot — what's derivable vs. what must be restored."
sidebar:
  order: 10
---

The platform's own footprint is stateless — every control-plane component reconciles from the Kubernetes
API server, so it rebuilds itself on a fresh install. What you must back up is the **data plane you
bring** plus **one small in-cluster secret** without which encrypted credential data is unrecoverable.
This page draws the line between *derivable* and *must-be-restored*.

## What must be backed up (and what doesn't)

| Asset | Back up? | Why |
|-------|----------|-----|
| **Control-plane Postgres** | **Yes** | The system-of-record: durable runs, prompt/agent versions, datasets + labels, cost rollups, the audit log. Not derivable. |
| **The credential-store data** (Postgres grants, or the Kubernetes-Secret grants) | **Yes** | Per-user OBO tool grants. Losing them = every user must re-consent. |
| **The KEK** (LocalSealer Secret, or the external KMS/transit key) | **Yes — critically** | Credential ciphertext is **inert without the KEK**. A Postgres backup without the KEK is unrestorable credential data. |
| **Object store** (S3-compatible) | **Yes** (your bucket's own policy) | Blobs, datasets, replay fixtures, checkpoints. |
| **State Layer (Valkey/Redis)** | **Optional** | Session memory + quota accumulators. Sessions fail *open* on loss; quota windows reset (acceptable). Durable runs are in Postgres, not here. Snapshot only if you want warm session continuity. |
| **CRDs / manifests** | **No** (derivable) | Your `AgentDeployment`s and policies live in git / GitOps. Re-apply them; the controller rebuilds agents. |
| **Control-plane pods / gateway config** | **No** (derivable) | Reconciled from the CRDs on a fresh install. |
| **The capability keypair** (`bff-capability` Secret) | **Yes if BYO; else regenerate-safe** | The hook never re-keys an existing key. If you generated it in-cluster, back up the Secret so a rebuild keeps existing OBO grants valid; a fresh key invalidates in-flight grants. |

## Backing up

**Postgres (control plane + credential grants):**

```bash
pg_dump "$CONTROLPLANE_DSN" > controlplane-$(date +%F).sql
# and the credential-store DSN if it's a separate Postgres
```

**The KEK (LocalSealer) — the one people forget:**

```bash
kubectl get secret cred-kek -n agent-engine-system -o yaml > cred-kek-$(date +%F).yaml
```

Store the KEK backup **separately** from the Postgres backup and with tighter access — together they are
the credential data in the clear. For an **external** KMS/transit custodian (OpenBao transit, cloud
CMK), the "backup" is that service's own key durability/backup policy — the ciphertext in Postgres
references a `key_id` that must still exist. Do **not** delete a per-tenant transit key you still need
(that is crypto-shredding — irreversible by design).

**State Layer (only if you want warm sessions):** never `cp /data`. Trigger a snapshot and confirm it
completed before copying:

```bash
valkey-cli BGSAVE
valkey-cli INFO persistence   # poll rdb_bgsave_in_progress:0 / rdb_last_save_time before snapshotting
```

For the in-cluster **persistent** tier, AOF gives restart durability; a network-attached PVC lets the
volume follow a reschedule (a ReadWriteOnce local volume pins the pod to one node).

## Restoring

1. **Fresh install** the platform (`helm install`) — control plane rebuilds stateless.
2. **Restore Postgres** (`psql < dump.sql`) before the control plane needs it, or point
   `CONTROLPLANE_DSN` at the restored instance.
3. **Restore the KEK Secret** (`kubectl apply -f cred-kek-*.yaml`) — credential ciphertext is
   unreadable until it's back. For an external custodian, ensure the referenced keys still exist.
4. **Restore the capability keypair** Secret if you're keeping existing OBO grants valid.
5. **Re-apply your CRDs** (GitOps / `kubectl apply`) — the controller reconstructs agents, routes,
   policies, tenants.
6. **Restore the object store / State Layer** if you snapshotted them.

## Prove the round-trip

Back-and-restore is only real if you've exercised it. A minimal drill: write a credential grant and
some session memory, take a Postgres dump + the KEK backup, tear down, restore into a fresh install, and
confirm the grant resolves and the run history is intact. Treat "restore" as a tested runbook, not a
theory.

## See also

- [Architecture in production](/operations/architecture-in-production/)
- [Credential stores](/operations/credential-stores/) · [Secrets](/operations/secrets/)
- [High availability](/operations/high-availability/)
- [Helm values](/reference/helm-values/)
