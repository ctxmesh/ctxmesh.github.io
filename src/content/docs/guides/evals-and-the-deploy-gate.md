---
title: Evals & the deploy gate
description: "Gate a release on a passing eval — block a bad prompt, model, or image before it serves."
sidebar:
  order: 5
---

**Goal:** stop a regression from serving real traffic — score a candidate against a dataset and hold
promotion until it passes.

**Prerequisites:** an agent deployed; a dataset in your object store (or the mock scorer for a
provider-free trial).

## When to use / when not

- **Use** to gate a prompt/model/image change on measurable quality before it serves.
- **Not** for online quality monitoring — that's the [feedback & improvement loop](/guides/feedback-and-improvement/).

## 1. Define the EvalSuite

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: EvalSuite
metadata:
  name: support-quality
  namespace: my-team
spec:
  dataset:
    ref: support-cases@3            # a pinned dataset (name@version) — reproducible
  scorers:
    - type: mock                    # deterministic, CI-reproducible (no provider needed)
      weight: 1
    # - type: llm-judge             # a judge model via a ModelRoute
    #   modelRoute: cheap-judge
    #   weight: 2
  threshold: "0.8"                  # suite score (weighted mean of scorers), 0..1 (string)
  gate: block                       # block | warn
```

## 2. Reference it from the agent

```yaml
spec:
  evalSuiteRef: support-quality
```

Now a change to the agent (new prompt, model, or image) produces a candidate `AgentVersion` that must
clear the gate before it serves. **No `evalSuiteRef` ⇒ no gate**, zero overhead.

## 3. Watch the gate

```bash
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.gate.phase} {.status.gate.score} {.status.gate.decision}{"\n"}'
# phases: pending → scoring → awaiting-promotion → promoted   (or → blocked)
```

## 4. Promote

Promotion is **human-gated** in v1 — a passing score surfaces the candidate but doesn't auto-serve it:

```bash
# Promote the scored revision (or click Promote in the console).
kubectl annotate agentdeployment support-agent -n my-team \
  agents.ctxmesh.ai/promote=<scoredRevision>
```

(For automatic progression on a passing online score, see [Canary & rollout](/guides/canary-and-rollout/).)

## 5. Gate in CI

Run the same suite in your pipeline before you ever apply the change:

```bash
agentry eval --candidate ./agent.yaml --dataset support-cases@3 --min-score 0.8
# exit 0 = pass, 1 = below threshold, 2 = error; emits JUnit for your CI.
```

## Defaults & failure modes

- `threshold` is `0..1`; the **mock** scorer needs no provider (offline CI).
- **Langfuse/judge unavailable** with `gate: block` → fails **closed** (holds the rollout);
  `gate: warn` → promotes with an `eval.unscored` marker.
- **Prompt git ref unreachable** → reconcile error; the old revision keeps serving (no half-apply).

## See also

[EvalSuite reference](/reference/crd/evalsuite/) · [Canary & rollout](/guides/canary-and-rollout/) · [Feedback & improvement](/guides/feedback-and-improvement/)
