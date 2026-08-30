---
title: FeedbackStore
description: A declarative multi-source feedback model — which score names belong to which source — gating ingestion and attributing scores. Config only; Langfuse is the store of record.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `FeedbackStore` · Scope: Namespaced · shortName: `fs`

## Overview

A `FeedbackStore` is a namespaced, reusable, **declarative** feedback model referenced by
`AgentDeployment.spec.feedbackStoreRef`. It declares which score names belong to which source (human /
external) so the **BFF write path** can *gate* ingestion by declared score names and the read path can
*attribute* each score to its source. Enforcement point: the **BFF**. The headline property is that it
stores **no feedback data** — raw scores live in Langfuse (the store of record); this CRD is config.
Deleting it stops gating/attribution but the raw feedback in Langfuse is retained. At least one source
(human or external) must be declared. Absent on an agent ⇒ today's open relay to Langfuse, unchanged.

## When to use / when not

- **Use** to define a curated set of feedback dimensions (thumbs, ratings, CSAT, NPS) and reject
  undeclared score names, and to attribute scores to human vs external channels.
- **Not** a data store — Langfuse holds the raw scores. This is a declarative config object.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.mode` | string (enum) | No | `Enforce` | `Enforce` rejects a submitted score whose name is not declared by any source; `Monitor` accepts + counts an undeclared score (safe migration). |
| `spec.human` | object | No | — | The human-annotation source (dashboard thumbs/ratings + corrections). Optional singleton. |
| `spec.human.scores` | []object | **Yes** (if `human` set) | — | Human-annotation score dimensions. MinItems 1, MaxItems 64. |
| `spec.external` | []object | No | — | External-signal channels (webhook/API rating, completion, business metric). Max 32. |
| `spec.external[].name` | string | **Yes** (per item) | — | External channel name (the allowlisted signal source, e.g. `csat-webhook`). 1–128 chars. |
| `spec.external[].score` | object | **Yes** (per item) | — | The single score dimension this channel writes (a `ScoreDecl`, below). |

### `ScoreDecl` (each score dimension)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | **Yes** | — | The Langfuse score name this dimension binds to (e.g. `thumbs`, `accuracy`, `nps`). **Unique across the whole FeedbackStore.** 1–128 chars. |
| `dataType` | string (enum) | No | `NUMERIC` | `NUMERIC` / `BOOLEAN` / `CATEGORICAL` (mirrors Langfuse dataTypes). NUMERIC/BOOLEAN carry a numeric value; CATEGORICAL carries a string label. |
| `categories` | []string | No | — | Allowed label set for a `CATEGORICAL` score (informational in v1; ignored otherwise). Max 64 (set). |

> Note: the fold-normalization knobs (online/weight/min/max) and an LLM-as-judge source are deferred —
> they are additive later, not shipped inert.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state. `Validated=True` when the spec is coherent; `Validated=False` (reason `InvalidSpec`) when there is no source or a duplicate score name across sources. |

## Examples

### Minimal — human thumbs

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: FeedbackStore
metadata:
  name: support-feedback
  namespace: my-team
spec:
  human:
    scores:
      - name: thumbs
        dataType: BOOLEAN
```

### Fuller — human + external channels

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: FeedbackStore
metadata:
  name: support-feedback
  namespace: my-team
spec:
  mode: Enforce
  human:
    scores:
      - name: thumbs
        dataType: BOOLEAN
      - name: accuracy
        dataType: NUMERIC
      - name: resolution
        dataType: CATEGORICAL
        categories: [resolved, escalated, abandoned]
  external:
    - name: csat-webhook
      score:
        name: csat
        dataType: NUMERIC
```

Reference it from an agent with `spec.feedbackStoreRef: support-feedback`.

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [EvalSuite](/reference/crd/evalsuite/) · [AgentDeployment](/reference/crd/agentdeployment/)
