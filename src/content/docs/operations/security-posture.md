---
title: Security posture
description: "What ctxmesh ships for isolation, secrets, and fail-closed enforcement — and the honest gaps."
sidebar:
  order: 2
---

This page states, plainly, what the platform enforces today, where the trust boundaries are, and
what integrates via standard tooling vs. what is post-GA. Platform teams evaluate on exactly this.

## Trust boundaries

- **The console never elevates.** Every console/BFF read is **caller-scoped** — it acts with *your*
  Kubernetes identity and RBAC, never a privileged service account. You see exactly what your RBAC
  permits. See [RBAC](/operations/rbac/) and [Security model](/concepts/security-model/).
- **Agents never hold provider keys.** All model calls go through the gateway, which injects keys from
  a [`SecretBinding`](/reference/crd/secretbinding/) at call time. Agent pods have the gateway URL, not
  the credential.
- **The launcher is the un-forgeable enforcement point.** Guardrails, tool brokering, memory scoping,
  and on-behalf-of credential handling are enforced in-pod by the launcher (PID 1), not by the agent
  code it supervises.
- **On-behalf-of (OBO) identity.** Per-run capabilities carry the caller's verified identity, so tool
  access and memory are scoped per user where configured — not a shared blanket credential.

## Fail-closed by default

The platform denies rather than degrades at these points:

- A missing/invalid **policy reference** (guardrail / approval / eval / feedback) → the agent is held
  `Ready=False`, never served ungoverned.
- A **guardrail engine error**, oversize body, or malformed policy → the request is **blocked**
  (`failMode: closed`, the default).
- An **unrunnable eval gate** (`gate: block`) → the rollout is held, never silently promoted.
- An **approval** whose policy or caller identity can't be verified → denied, never RBAC-only fallback.

## Network & transport

- **Namespace isolation via NetworkPolicy** — agent, control-plane, and data-plane traffic is
  constrained by default policies shipped with the chart.
- **TLS** on ingress and the console.
- **Service-mesh compatible** — ctxmesh runs cleanly under Istio/Linkerd; if you require **mTLS
  everywhere**, provide it via your mesh. Native pod-to-pod mTLS is a hardening-install / post-GA item,
  not a GA default — we don't pretend otherwise.

## Secrets

- **Native `SecretBinding` = Kubernetes Secrets** (`backend: kubernetes`), which assumes you've enabled
  **etcd encryption at rest** (a cluster prerequisite, your responsibility).
- **External backends** (Vault, AWS, GCP) integrate via the **External Secrets Operator** — sync into
  the namespace, then bind. See [Secrets](/operations/secrets/).
- **MCP OBO credentials** use a pluggable [`CredentialStore`](/reference/crd/credentialstore/) with KEK
  custody + crypto-shredding.

## Audit

Governance-relevant actions (grants, approvals, guardrail blocks, CRUD) are recorded to an **audit
log**, queryable by namespace/actor/verb/resource in the console. See [Audit](/operations/audit/).

## Honest status (pre-GA)

We publish what's shipped, what integrates via the standard CNCF tool, and what's post-GA — because a
credible security story is a specific one:

| Area | GA reality |
|------|-----------|
| Isolation | NetworkPolicy + TLS shipped |
| mTLS pod-to-pod | via your service mesh; native default is post-GA |
| Secrets | Kubernetes Secrets natively; Vault/AWS/GCP via External Secrets Operator |
| RBAC | caller-scoped console + built-in personas |
| Enforcement | fail-closed at the points above |

## See also

[RBAC](/operations/rbac/) · [Secrets](/operations/secrets/) · [Security model](/concepts/security-model/) · [Audit](/operations/audit/)
