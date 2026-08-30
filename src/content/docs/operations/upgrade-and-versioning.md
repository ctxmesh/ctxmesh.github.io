---
title: Upgrade & versioning
description: "The upgrade path, the deprecation policy in practice, storage versions, and no-drift Helm."
sidebar:
  order: 6
---

Upgrading ctxmesh is a `helm upgrade`. This page covers what that touches, the **API versioning and
deprecation contract** that makes "stable API" honest, and the one genuinely one-way migration (enabling
in-cluster state-layer persistence).

## The upgrade path

```bash
helm upgrade ctxmesh ./deploy/helm/agent-engine \
  -f your-values.yaml
```

The chart renders **byte-for-byte the same** resources as the base manifests with default values (the
`make helm-verify` no-drift gate), so an upgrade is a clean apply — new CRD versions, controller image,
and any values you changed. On upgrade the platform runs its **install hooks** again:

- A **capability-keypair hook** ensures the platform Ed25519 keypair exists — but **never re-keys** an
  existing key (that would invalidate every OBO grant). BYO by pre-creating the `bff-capability` Secret.
- A **preflight Job** validates config coherence (required env non-empty, the capability keypair
  private↔public consistent, the control-plane store reachable) and **fails the upgrade** with
  actionable messages rather than letting the platform silently degrade at runtime.

Pin an **immutable image tag/digest** in production (`controllerManager.image.tag`, and the per-component
image tags) so an upgrade is deliberate, not implicit in a floating `latest`.

## API versioning & deprecation policy

ctxmesh's API is served at **`agents.ctxmesh.ai/v1beta1`** (the storage version). GA ships at `v1beta1`
**on purpose** — it is currently a field-identical graduation of `v1alpha1`, and the conversion-webhook +
storage-migration path is the entry gate of a future `v1`, not a GA claim. The published policy
(Kubernetes' deprecation policy scaled to a single-vendor operator) is the contract you can build on:

1. **Version-support window.** A served version stays served for **≥6 months or 3 minor releases,
   whichever is longer**, after `v1` reaches parity *and* the deprecation is announced. No served
   version is dropped in the release that deprecates it.
2. **Within-version rule — additive only.** Within a served version, fields are never removed or
   semantically redefined; new fields are optional-with-defaults; enum values may be added, never
   removed; validation may **loosen**, never tighten.
3. **Storage rule.** The storage version moves only to a version served ≥1 release; before an old
   version stops being served, all stored objects are migrated.
4. **Deprecation notice.** Any version/kind deprecation is announced in release notes **and** marked in
   the served CRD (`deprecated: true` + a `deprecationWarning`) at least **2 releases / 6 months**
   before removal.
5. **Behavioral annotations + labels are API.** The `agents.ctxmesh.ai/promote`, `/rollback`, and
   `/rollout-abort` annotations and the `agents.ctxmesh.ai/tenant` label are versioned surface under
   rules 1–4 — documented and validated like fields. See
   [Annotations & labels](/reference/annotations-and-labels/).

:::note
Pre-GA, nothing in the API is frozen — so the pre-GA precursor retirements (e.g. folding
`MemoryBinding` into `AgentDeployment.spec.sessionMemory`) completed as **deletions**, not deprecations.
Post-GA, rules 1–4 apply.
:::

## Storage versions in practice

Every kind stores at `v1beta1`. Several kinds are **also served** at `v1alpha1` during the deprecation
window with a direct, field-identical conversion; the rest are single-version, born in `v1beta1`. The
full served-version matrix is on the [API group](/reference/api-group/) page. **Always author resources
at `v1beta1`.** Inspect what your cluster serves:

```bash
kubectl api-resources --api-group=agents.ctxmesh.ai
kubectl get crd agentdeployments.agents.ctxmesh.ai -o jsonpath='{.spec.versions[*].name}'
```

## No-drift Helm

Production hardening is exposed as **values-gated dials that default off**, so `helm template` with
defaults still matches the base manifests. Turning a dial on (replicas, PDBs, persistence, external
state) renders the extra resources; leaving it off renders nothing extra. This is what lets an upgrade
stay a clean, reviewable diff. See [Helm values](/reference/helm-values/).

## The one-way migration: enabling in-cluster state-layer persistence

Enabling the optional in-cluster **persistent** state layer (`statelayer.persistence.enabled: true`)
changes the Valkey workload from a Deployment to a StatefulSet — and the two collide on the
`control-plane: statelayer` pod selector. This is a **deliberate, one-way** step:

1. Set `devDataPlane.enabled: false`.
2. `kubectl delete deployment statelayer` (or let the chart's pre-upgrade hook require it).
3. Then enable `statelayer.persistence.enabled: true`.

There is **no rollback without data loss**. The recommended production posture avoids this entirely —
use **BYO external managed Redis/Valkey** and never run the in-cluster persistent tier. See
[High availability](/operations/high-availability/).

## See also

- [Production install](/operations/install-production/)
- [High availability](/operations/high-availability/)
- [API group](/reference/api-group/) · [Annotations & labels](/reference/annotations-and-labels/)
- [Helm values](/reference/helm-values/)
- [Custom resources](/concepts/custom-resources/)
