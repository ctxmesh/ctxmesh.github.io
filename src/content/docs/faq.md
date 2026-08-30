---
title: FAQ
description: "Common questions: is this a model host or a trace database (no), the Kubernetes requirement, OSS vs. enterprise, and GA status."
---

Crisp answers to the questions platform teams ask first. For depth, follow the links.

## What ctxmesh is (and isn't)

### Is ctxmesh a model host / inference server?

**No.** ctxmesh never hosts, serves, or fine-tunes models. All model access is to **external providers**
through the model gateway (LiteLLM) — you bring the provider keys; agents never hold them. Model hosting
and training are explicitly out of scope. See [Model routing & cost](/guides/model-routing-and-cost/).

### Is ctxmesh a trace database or a trace explorer?

**No.** ctxmesh **emits** OpenInference/OTLP spans and delegates the deep trace explorer to an existing
backend (Langfuse, Tempo, Honeycomb, or your OTLP collector). It builds only the mesh-specific views. It
is not a general-purpose trace store. See [Observability backends](/operations/observability-backends/).

### So what *is* it?

A **Kubernetes-native control plane for AI agents**: you declare agents and policies as custom resources,
and the platform runs them with governance — model routing + budgets, guardrails, per-user tool
credentials, memory, multi-agent meshes, evals + canary rollout, tenancy/quotas, and an audit trail. The
launcher (PID 1 in every agent pod) is the un-forgeable enforcement point. See
[Architecture](/concepts/architecture/).

## Requirements

### Do I need Kubernetes?

**Yes.** ctxmesh is a Kubernetes operator — CRDs, a controller, Knative-based serving. There is no
non-Kubernetes deployment. For **local iteration without a cluster**, the CLI's `agentry dev` runs
an agent against a mock or real gateway (optionally with the console UI) — but the platform itself
targets Kubernetes. See [Production install](/operations/install-production/).

### What are the cluster prerequisites?

A recent Kubernetes with **etcd encryption at rest** enabled, **Knative Serving** (the serving execution
model), a **NetworkPolicy-enforcing CNI** (for registry isolation), and — in production — external
managed **Postgres**, **Redis/Valkey**, and an **S3-compatible** object store. `cert-manager` /
`external-dns` / your load balancer are cluster controllers you install out of band. See
[Prerequisites](/operations/install-production/#prerequisites).

### Do agents need an SDK?

**No.** Every platform capability (memory, tools, feedback, telemetry, A2A) is a **language-agnostic,
launcher-traced localhost endpoint** — the optional Python/TypeScript SDK is just typed sugar over it.
Deep traces come from base-image auto-instrumentation, not an SDK. See
[Launcher endpoints](/reference/launcher-endpoints/).

## Security & operations

### Does the console run with admin privileges?

**No.** The console/BFF is **caller-scoped** — every read and write runs with *your* Kubernetes identity
and RBAC, never a privileged service account. Two operators see different things; the platform never
elevates. See [RBAC & personas](/operations/rbac/) and [Security posture](/operations/security-posture/).

### Where do provider keys and tool credentials live?

Provider keys live in a **`SecretBinding`** (Kubernetes Secrets natively; Vault/AWS/GCP via the External
Secrets Operator) and are injected by the gateway at call time — **never in an agent pod**. Per-user tool
credentials live in a pluggable **credential store** with KEK custody and crypto-shredding. See
[Secrets](/operations/secrets/) and [Credential stores](/operations/credential-stores/).

### Is there mTLS everywhere?

GA ships **NetworkPolicy isolation** plus **server-authenticated TLS on the credential hop**. Full
service-mesh mTLS + SPIFFE is provided via **your service mesh** (Istio/Linkerd) — ctxmesh is
mesh-compatible, not mesh-bundled. This is stated plainly, not papered over. See
[Security posture](/operations/security-posture/#network--transport).

### What do I back up?

Your **control-plane Postgres**, the **credential-store data + its KEK** (ciphertext is inert without the
KEK), and your object store. The platform's own components are stateless and rebuild from your CRDs. See
[Backup & restore](/operations/backup-and-restore/).

## Licensing & status

### Is it open source? OSS vs. enterprise?

The **core is Apache 2.0** (open-core). Open-core includes agent lifecycle, model routing + budgets,
guardrails, per-user OBO credentials, memory, multi-agent meshes, evals + canary, tenancy + quotas, the
audit surface, and cluster-OIDC via Dex. **Enterprise / phase-2** items (recorded so the boundary stays
explicit) include federated SAML/SCIM/multi-IdP, cluster-per-tenant isolation, billing/metering export,
and LiteLLM DB-backed team/virtual keys.

### What's the GA status?

Pre-GA. The API is served at **`agents.ctxmesh.ai/v1beta1`** — GA ships at `v1beta1` on purpose (a `v1`
requires the conversion-webhook + storage-migration infrastructure, exercised by a real schema change).
The docs are explicit about what's **shipped**, what integrates via a **standard tool** (External Secrets
Operator, your service mesh, a cluster admission policy for image signatures), and what's **post-GA**.
Some chart coordinates and field specifics finalize toward GA. See
[Upgrade & versioning](/operations/upgrade-and-versioning/).

## See also

- [Architecture](/concepts/architecture/) · [Custom resources](/concepts/custom-resources/)
- [Production install](/operations/install-production/) · [Security posture](/operations/security-posture/)
- [Reference](/reference/)
