---
title: Workflow
description: A declarative graph of agent invocations — conditional / loop / map control flow with CEL bindings and typed error routing — evaluated deterministically in Go.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `Workflow` · Scope: Namespaced · shortName: `wf`

## Overview

A `Workflow` is a namespaced, declarative graph of agent invocations with CEL data flow and
conditional / loop / map control flow, evaluated **deterministically in Go (never by a model)**. Each
node is a real sub-run of a standing [`AgentDeployment`](/reference/crd/agentdeployment/), so structured
outputs and guardrails apply per node with no new code. Enforcement point: the **controller**
(validation only — structure + CEL + the referenced-output⇒outputSchema rule + registry membership);
it reports `Validated`/`Invalid` and does **no execution**. A workflow *instance* is a durable Run
with a `workflowRef` (instances of record live in Postgres, not etcd), run by the executor.

## When to use / when not

- **Use** for a fixed, auditable process graph — branching, retries, typed error handling, fan-out.
- **Use** [`AgentTeam`](/reference/crd/agentteam/) instead for open-ended, model-chosen delegation.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.registryRef` | string | **Yes** | — | The [`AgentRegistry`](/reference/crd/agentregistry/) (same namespace) trust boundary; every step's `agentRef` must be a member. DNS label 1–63 chars. |
| `spec.inputSchema` | JSON (RawExtension) | No | — | Workflow input as a JSON Schema (stored verbatim, preserve-unknown). Types the `input` CEL variable. Optional (untyped ⇒ dynamic map). |
| `spec.steps` | []object | **Yes** | — | Graph nodes (names unique). MinItems 1, MaxItems 128. The first step is the default start. |
| `spec.budget` | object | No | — | Total node-launch budget (reuses the `SpawnBudget` shape: maxFanOut / maxSpawnDepth / maxTotalSpawns). A nil block resolves to defaults. |

### `spec.steps[]` (a WorkflowStep)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | **Yes** | — | Step id, unique in the workflow. CEL references it as `steps.<name>.output`. DNS label 1–63 chars. |
| `agentRef` | string | **Yes** | — | Standing AgentDeployment invoked as a sub-run; must be a registry member. DNS label 1–63 chars. |
| `input` | map[string]string | No | — | Maps each node-input key to a CEL expression over `input` + prior steps' outputs (e.g. `steps.classify.output.topic`). Explicit data flow. |
| `outputSchema` | JSON (RawExtension) | No | — | Node's typed output as a JSON Schema. **Required whenever this node's output is referenced** by another step's `when`/`input`/`map.over`. Optional for a terminal/unreferenced node. |
| `retries` | int32 | No | `0` | Per-node retry count. Minimum 0. |
| `next` | string | No | — | Unconditional next step (`""` = terminal). Exactly one of `next` / `branches` / `map` / `loop` per step (controller-validated). DNS-label-or-empty. |
| `branches` | []object | No | — | Ordered conditional edges (first matching `when` wins). Max 64. |
| `branches[].when` | string | **Yes** (per item) | — | CEL boolean predicate over `input` + prior outputs. 1–4096 chars. |
| `branches[].to` | string | **Yes** (per item) | — | Step to run when `when` is true; must exist. DNS label 1–63 chars. |
| `default` | string | No | — | Fallthrough step when no branch matches (`""` = terminal). Only meaningful with `branches`. |
| `onError` | string | No | — | Handler step if the sub-run fails after exhausting retries (sugar for a catch-all). Empty ⇒ fail-fast. Not supported on map/loop nodes. |
| `catch` | []object | No | — | Ordered error-class catchers; first matching classified failure code (or `*`) routes to `next`. |
| `catch[].errors` | []string | **Yes** (per item) | — | Failure codes matched (e.g. `timeout`, `cancelled`, `budget_exceeded`, `guardrail_denied`, `tool_error`, `agent_error`, `platform_error`) or `*`. MinItems 1. |
| `catch[].next` | string | **Yes** (per item) | — | Handler step; must exist. DNS label 1–63 chars. |
| `map` | object | No | — | Makes this a fan-out node (set instead of `next`/`branches`). |
| `map.over` | string | **Yes** (if map) | — | CEL list to fan out over. 1–4096 chars. |
| `map.as` | string | **Yes** (if map) | — | Loop-variable name each element binds to. DNS label 1–63 chars. |
| `map.parallelism` | int32 | No | `1` | Concurrent `do` invocations (bounded fan-out). Minimum 1. |
| `map.do` | string | **Yes** (if map) | — | Step run per element; must exist. DNS label 1–63 chars. |
| `map.join` | string | No | — | Optional reduction step consuming collected outputs; must exist when set. |
| `map.completion` | string (enum) | No | `all` | `all` (fail-fast join, collect all on success) or `any` (first successful output, fail only on exhaustion). |
| `loop` | object | No | — | Makes this a loop node (set instead of `next`/`branches`). |
| `loop.until` | string | **Yes** (if loop) | — | CEL boolean predicate; when true the loop exits. 1–4096 chars. |
| `loop.maxIterations` | int32 | **Yes** (if loop) | — | Hard cap so the workflow cannot loop forever. Minimum 1. |
| `loop.do` | string | **Yes** (if loop) | — | Step run each iteration; must exist. DNS label 1–63 chars. |

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | `Validated=True` means the graph is structurally sound, every CEL expression compiles, every referenced step pins an `outputSchema`, and `registryRef` + every `agentRef` resolve to registry members. `Validated=False` carries reason + message. |
| `status.specHash` | string | Hash of the validated spec (drift detection; the executor pins it at instance creation). |
| `status.observedGeneration` | int64 | `.metadata.generation` last fully reconciled. |

## Examples

### Minimal — two linear steps

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Workflow
metadata:
  name: triage-then-answer
  namespace: my-team
spec:
  registryRef: support
  steps:
    - name: classify
      agentRef: triage-agent
      outputSchema:
        type: object
        properties:
          topic: { type: string }
      next: answer
    - name: answer
      agentRef: answer-agent
      input:
        topic: steps.classify.output.topic
```

### Fuller — branching + error routing

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Workflow
metadata:
  name: support-flow
  namespace: my-team
spec:
  registryRef: support
  inputSchema:
    type: object
    properties:
      message: { type: string }
  steps:
    - name: classify
      agentRef: triage-agent
      input:
        message: input.message
      outputSchema:
        type: object
        properties:
          topic: { type: string }
      branches:
        - when: steps.classify.output.topic == "billing"
          to: billing
      default: general
    - name: billing
      agentRef: billing-agent
      catch:
        - errors: ["tool_error", "*"]
          next: fallback
    - name: general
      agentRef: answer-agent
    - name: fallback
      agentRef: human-handoff-agent
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentTeam](/reference/crd/agentteam/) · [AgentRegistry](/reference/crd/agentregistry/) ·
  [AgentDeployment](/reference/crd/agentdeployment/)
