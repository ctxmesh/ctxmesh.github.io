---
title: EvalSuite
description: A dataset + scorers + threshold used as a deploy gate — score a candidate revision and promote or block based on the result.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `EvalSuite` · Scope: Namespaced · shortName: `es`

## Overview

An `EvalSuite` defines a set of scorers and a threshold used to **gate an AgentDeployment rollout**.
An agent references a suite via `AgentDeployment.spec.evalSuiteRef`; when present, the controller
scores the candidate revision against the suite and promotes or blocks the rollout based on the result
and the suite's gate policy. Enforcement point: the **controller** (deploy gate). Absent `evalSuiteRef`
means no gate — the deploy proceeds unchanged. Each scorer yields a 0..1 score; the suite score is the
weighted mean. An optional online-scoring policy scores *production* runs post-hoc, separate from the
pre-promotion offline gate.

## When to use / when not

- **Use** to require a candidate to pass a quality bar (a dataset scored by one or more scorers) before
  it serves — the deploy gate.
- **Use** the `online` policy to keep scoring production traffic for regression detection / canary verdicts.
- **Not** for raw feedback storage — see [`FeedbackStore`](/reference/crd/feedbackstore/).

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.dataset` | object | **Yes** | — | The dataset of cases to score against. |
| `spec.dataset.ref` | string | **Yes** | — | Dataset name (a Langfuse dataset or an inline harness fixture). MinLength 1. |
| `spec.scorers` | []object | **Yes** | — | Scorers to apply. MinItems 1. Each yields 0..1; the suite score is the weighted mean. |
| `spec.scorers[].name` | string | **Yes** (per item) | — | Unique scorer identifier within the suite. MinLength 1. |
| `spec.scorers[].type` | string (enum) | **Yes** (per item) | — | `mock` (deterministic, CI-reproducible), `llm-judge` (Langfuse LLM-as-judge), or `code` (Langfuse code evaluator). |
| `spec.scorers[].weight` | int32 | No | `1` | Relative weight in the weighted mean. Minimum 1. |
| `spec.threshold` | string | **Yes** | — | Minimum weighted-mean score for the gate to pass, exact decimal string in `[0,1]` e.g. `0.80` (up to 4 fractional digits). |
| `spec.gate` | string (enum) | No | `block` | Action when score < threshold: `block` (hold the rollout; old revision keeps serving) or `warn` (promote anyway, annotate `eval.warn`). |
| `spec.online` | object | No | — | Online-scoring policy for production runs (distinct from the offline gate above). Absent ⇒ platform defaults (LLM judge off; free operational + feedback components score every run). |
| `spec.online.sampleRate` | string | No | `0` (judge off) | Fraction of production traces sent to the LLM judge, decimal string `0..1` e.g. `0.05` (deterministic hash-of-traceId sampling). |
| `spec.online.maxScoredPerDay` | int32 | No | `0` (judge off) | Hard per-agent-per-day cap on judge invocations (control-plane spend). Minimum 0. |
| `spec.online.window` | string | No | platform default (`1h`) | Aggregation window per scoring pass — a Go duration string (`1h`, `24h`). A bad duration falls back to the default (logged). |
| `spec.online.minSamples` | int32 | No | platform default | Minimum scored runs in a window before a component yields a verdict (below it, regression detection treats the window as "no verdict"). Minimum 0. |

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state of the EvalSuite. |

> The **gate outcome** for a specific deployment lives on the *AgentDeployment*'s `status.gate`
> (phase / score / threshold / decision / scoredRevision) — see [AgentDeployment](/reference/crd/agentdeployment/).

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: EvalSuite
metadata:
  name: support-quality
  namespace: my-team
spec:
  dataset:
    ref: support-golden-set
  scorers:
    - name: correctness
      type: llm-judge
  threshold: "0.80"
```

### Fuller — weighted scorers, warn gate, online scoring

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: EvalSuite
metadata:
  name: support-quality
  namespace: my-team
spec:
  dataset:
    ref: support-golden-set
  scorers:
    - name: correctness
      type: llm-judge
      weight: 3
    - name: format-check
      type: code
      weight: 1
  threshold: "0.85"
  gate: warn
  online:
    sampleRate: "0.05"
    maxScoredPerDay: 200
    window: "1h"
    minSamples: 20
```

Reference it from an agent with `spec.evalSuiteRef: support-quality`.

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) (deploy gate + rollout) ·
  [FeedbackStore](/reference/crd/feedbackstore/) · [AlertPolicy](/reference/crd/alertpolicy/) (regression alerts)
