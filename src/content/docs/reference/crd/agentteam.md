---
title: AgentTeam
description: A supervisor + governed roster of summonable sub-agents with a spawn budget — multi-agent delegation via delegate_to.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AgentTeam` · Scope: Namespaced · shortName: `at`

## Overview

An `AgentTeam` is a governed roster of summonable sub-agents plus a supervisor and a spawn budget. The
controller resolves and validates the roster against `spec.registryRef` (the trust boundary); at
runtime the supervisor delegates to a roster member via the `delegate_to` tool, which starts the
member as a durable **sub-run** — inheriting the invoking user's on-behalf-of grant (no re-consent),
the conversation, and the trace, bounded by the spawn budget and tenant quota. Enforcement point: the
**controller** (roster validation) and the **state-layer proxy / BFF** (spawn-budget ceilings). Every
member (supervisor + roster) must be a member of `registryRef`.

## When to use / when not

- **Use** for supervisor-driven, on-demand delegation to a set of standing agents.
- **Use** [`Workflow`](/reference/crd/workflow/) instead when you need a *declarative graph* (conditional /
  loop / map) evaluated deterministically rather than model-chosen delegation.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.registryRef` | string | **Yes** | — | The [`AgentRegistry`](/reference/crd/agentregistry/) (same namespace) that is the team's trust boundary. Supervisor + every roster member must be members. DNS label 1–63 chars. |
| `spec.supervisor.agentRef` | string | **Yes** | — | The orchestrating [`AgentDeployment`](/reference/crd/agentdeployment/) (role should be `orchestrator`); must be a registry member. DNS label 1–63 chars. |
| `spec.roster` | []object | **Yes** | — | Summonable sub-agents (names unique). MinItems 1, MaxItems 64. |
| `spec.roster[].name` | string | **Yes** (per item) | — | Roster-local id the supervisor uses to summon (the `delegate_to` `sub_agent` arg). DNS label 1–63 chars. |
| `spec.roster[].agentRef` | string | **Yes** (per item) | — | Standing AgentDeployment summoned as a sub-run; must be a registry member. DNS label 1–63 chars. |
| `spec.roster[].description` | string | No | — | Short natural-language summary surfaced to the supervisor's model at summon time. Max 512 chars. |
| `spec.spawnBudget` | object | No | maxFanOut=4, maxSpawnDepth=3, maxTotalSpawns=20 | Bounds on-demand delegation (aggregate ceilings, fail-closed). A nil block resolves to all defaults. |
| `spec.spawnBudget.maxFanOut` | int32 | No | `4` | Max sub-runs a single supervisor step may start. Minimum 1. |
| `spec.spawnBudget.maxSpawnDepth` | int32 | No | `3` | Max depth of the spawn tree (distinct from AMP hop depth). Minimum 1. |
| `spec.spawnBudget.maxTotalSpawns` | int32 | No | `20` | Max sub-runs across the whole spawn tree of one root run. Minimum 1. |

> Platform ceilings clamp any client-supplied budget: fan-out 128, spawn depth 32, total spawns 1024.
> These are far above any legitimate budget — they kill abuse, not the feature.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |
| `status.registry` | string | The resolved `registryRef` (the trust boundary). |
| `status.members` | []string | Resolved supervisor + roster members that are Ready standing agents in the registry. Max 256. |
| `status.conditions` | []Condition | `Ready=True` means registryRef, supervisor, and every roster member resolved and are all registry members. Failure reasons: `RegistryNotFound`, `MemberNotFound`, `NotARegistryMember`. |

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentTeam
metadata:
  name: support-team
  namespace: my-team
spec:
  registryRef: support
  supervisor:
    agentRef: triage-agent
  roster:
    - name: billing
      agentRef: billing-agent
      description: Handles invoices, refunds, and payment questions.
```

### Fuller — multiple roster members + spawn budget

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentTeam
metadata:
  name: support-team
  namespace: my-team
spec:
  registryRef: support
  supervisor:
    agentRef: triage-agent
  roster:
    - name: billing
      agentRef: billing-agent
      description: Invoices, refunds, payment questions.
    - name: technical
      agentRef: tech-agent
      description: Product troubleshooting and how-to.
  spawnBudget:
    maxFanOut: 4
    maxSpawnDepth: 3
    maxTotalSpawns: 20
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [Workflow](/reference/crd/workflow/) · [AgentRegistry](/reference/crd/agentregistry/) ·
  [AgentDeployment](/reference/crd/agentdeployment/)
