---
title: AgentRegistry
description: Groups AgentDeployments into a closed agent-to-agent mesh, enforced at L3/L4 (NetworkPolicy) and the launcher layer.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AgentRegistry` · Scope: Namespaced · shortName: `ar`

## Overview

An `AgentRegistry` groups a set of [`AgentDeployment`](/reference/crd/agentdeployment/)s into a closed
agent-to-agent (A2A) mesh. The controller resolves `memberSelector` to `status.members`, injects
`AGENT_REGISTRY_ID` + conversation-guard defaults into each member's pod template, and generates a
NetworkPolicy that enforces registry isolation at L3/L4. Enforcement points: the **network layer**
(NetworkPolicy) and the **app-layer launcher** (registry-membership check). The headline guarantee is
isolation — cross-registry A2A calls are blocked both at the network layer and by the launcher. In v1
an agent may belong to at most one registry (a second matching membership is a status warning).

## When to use / when not

- **Use** to form a trusted mesh so agents can call each other (A2A / delegation / workflows).
- **Use** to set default conversation guards (hop depth / budget) for the mesh.
- **Not** needed for a standalone agent with no A2A.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.registryId` | string | **Yes** | — | Stable identifier carried in every A2A message envelope. **Immutable after creation.** DNS label: 1–63 chars, pattern `^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$`. |
| `spec.memberSelector` | LabelSelector | **Yes** | — | Selects AgentDeployments in the same namespace that belong to this registry (an agent joins by carrying the matching label). |
| `spec.guards` | object | No | maxDepth=8, hopBudget=32 | Registry-level conversation-guard defaults, injected into every member. |
| `spec.guards.maxDepth` | int32 | No | `8` | Max hop depth for A2A calls; a call pushing depth+1 beyond this is rejected (`depth_exceeded`). Minimum 1. |
| `spec.guards.hopBudget` | int32 | No | `32` | Per-conversation hop allowance, decremented per A2A call; exhaustion returns `budget_exceeded`. Minimum 1. |
| `spec.roles` | []string | No | — | Custom role names valid in this registry, beyond the built-ins `orchestrator`/`worker`/`reviewer`. Assignable via `AgentDeployment.spec.role`. Max 64, each 1–63 chars. |

### Validation rules (admission, CEL)

- `registryId` is immutable after creation.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.members` | []string | AgentDeployments currently resolved as members. Max 256. |
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |
| `status.conditions` | []Condition | `Ready=True` means the selector resolved, members were annotated with the registry id, and guard defaults were injected. Failure reasons include `InvalidSelector`, `MultiRegistryConflict`. |

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentRegistry
metadata:
  name: support-mesh
  namespace: my-team
spec:
  registryId: support
  memberSelector:
    matchLabels:
      registry: support
```

Agents join by carrying the label:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: triage-agent
  namespace: my-team
  labels:
    registry: support
spec:
  image: ghcr.io/my-org/triage-agent:1.0.0
  role: orchestrator
```

### Fuller — custom guards and roles

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentRegistry
metadata:
  name: support-mesh
  namespace: my-team
spec:
  registryId: support
  memberSelector:
    matchLabels:
      registry: support
  guards:
    maxDepth: 6
    hopBudget: 24
  roles:
    - specialist
    - auditor
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/) · [Architecture](/concepts/architecture/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) · [AgentTeam](/reference/crd/agentteam/) ·
  [Workflow](/reference/crd/workflow/) · [AgentScalingPolicy](/reference/crd/agentscalingpolicy/)
