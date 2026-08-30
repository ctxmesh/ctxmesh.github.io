---
title: AgentVersion
description: An immutable, controller-created snapshot of an AgentDeployment spec — the unit of rollout and eval-gating.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AgentVersion` · Scope: Namespaced

## Overview

An `AgentVersion` is an **immutable, controller-created snapshot** of an
[`AgentDeployment`](/reference/crd/agentdeployment/)'s spec at a point in time. The controller creates
one whenever the AgentDeployment spec hash changes, naming it `<deployment>-<spec-hash-8>`.
Immutability is enforced by a CRD-level CEL rule (no webhook). AgentVersions are owner-referenced to
their parent AgentDeployment and garbage-collected automatically when the deployment is deleted.
Enforcement point: the **controller**. The headline guarantee is that a version is the stable,
reviewable unit of rollout and eval-gating — the exact config a revision serves.

You do not author `AgentVersion` objects; the controller creates them. This page documents their shape
for inspection and rollback (`agents.ctxmesh.ai/rollback=<version>` on the AgentDeployment).

## When to use / when not

- **Read** to inspect exactly what a revision was configured with, or to pick a rollback target.
- **Do not create/edit** — these are controller-managed and immutable.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.deploymentName` | string | **Yes** | — | Name of the parent AgentDeployment this version was snapshotted from. MinLength 1. |
| `spec.snapshot` | object | **Yes** | — | A verbatim copy of the `AgentDeploymentSpec` at creation time. Drives the Knative Service template; never modified after creation. See [AgentDeployment spec fields](/reference/crd/agentdeployment/#spec-fields). |

### Validation rules (admission, CEL)

- The entire spec is **immutable** (`self == oldSelf`).

## Status

`AgentVersion` has no status subresource — it is a pure immutable snapshot.

## Examples

A controller-created snapshot (read-only):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentVersion
metadata:
  name: echo-agent-7d9f4c1a
  namespace: my-team
  ownerReferences:
    - apiVersion: agents.ctxmesh.ai/v1beta1
      kind: AgentDeployment
      name: echo-agent
spec:
  deploymentName: echo-agent
  snapshot:
    image: ghcr.io/ctxmesh/echo-agent:latest
    port: 8080
    executionModel: serving
```

Inspect versions and roll back:

```bash
kubectl get agentversions -n my-team
kubectl annotate agentdeployment echo-agent -n my-team \
  agents.ctxmesh.ai/rollback=echo-agent-7d9f4c1a
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) · [EvalSuite](/reference/crd/evalsuite/)
